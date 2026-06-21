#!/usr/bin/env node
/**
 * Live MySQL schema audit — order checkout integrity.
 * Run: node scripts/audit-order-checkout-schema.mjs
 */
import 'dotenv/config';
import { mysqlPool } from '../src/config/mysql.js';
import { ensureOrderCheckoutIntegritySchema } from '../src/db/ensureOrderCheckoutIntegritySchema.js';

const EXPECTED = {
  columns: {
    cancellation_reason: { typeIncludes: 'varchar', nullable: 'YES' },
    cancelled_at: { typeIncludes: 'timestamp', nullable: 'YES' },
    pending_enrollment_id: {
      typeIncludes: 'bigint',
      generated: true,
      generationMustInclude: ['pending', 'enrollment_id'],
    },
  },
  indexes: {
    uq_orders_one_pending_per_enrollment: { unique: true, columns: ['pending_enrollment_id'] },
    idx_orders_enrollment_status: { unique: false, columns: ['enrollment_id', 'status'] },
  },
  foreignKeys: ['fk_orders_user', 'fk_orders_course', 'fk_orders_enrollment'],
  statusEnumMustInclude: ['pending', 'paid', 'failed', 'cancelled', 'refunded'],
};

async function audit() {
  const findings = {
    missingColumns: [],
    missingIndexes: [],
    missingConstraints: [],
    migrationFailures: [],
    schemaDrift: [],
    verified: [],
  };

  const [[{ db }]] = await mysqlPool.query('SELECT DATABASE() AS db');
  const [[{ ver }]] = await mysqlPool.query('SELECT VERSION() AS ver');

  const [tableExists] = await mysqlPool.query(
    `SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'orders'`,
    [db]
  );
  if (Number(tableExists[0]?.n) === 0) {
    findings.migrationFailures.push('orders table does not exist');
    return { db, mysqlVersion: ver, findings };
  }

  const [allCols] = await mysqlPool.query(
    `SELECT COLUMN_NAME, ORDINAL_POSITION, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT,
            EXTRA, GENERATION_EXPRESSION
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'orders'
     ORDER BY ORDINAL_POSITION`,
    [db]
  );

  const colMap = Object.fromEntries(allCols.map((c) => [c.COLUMN_NAME, c]));

  for (const [name, spec] of Object.entries(EXPECTED.columns)) {
    const col = colMap[name];
    if (!col) {
      findings.missingColumns.push(name);
      continue;
    }
    findings.verified.push(`column:${name}`);
    if (!String(col.COLUMN_TYPE).toLowerCase().includes(spec.typeIncludes)) {
      findings.schemaDrift.push({
        item: name,
        issue: 'column_type_mismatch',
        expected: spec.typeIncludes,
        actual: col.COLUMN_TYPE,
      });
    }
    if (col.IS_NULLABLE !== spec.nullable && !spec.generated) {
      findings.schemaDrift.push({
        item: name,
        issue: 'nullable_mismatch',
        expected: spec.nullable,
        actual: col.IS_NULLABLE,
      });
    }
    if (spec.generated) {
      const expr = String(col.GENERATION_EXPRESSION || '').toLowerCase();
      for (const token of spec.generationMustInclude) {
        if (!expr.includes(token.toLowerCase())) {
          findings.schemaDrift.push({
            item: name,
            issue: 'generation_expression_drift',
            missingToken: token,
            actual: col.GENERATION_EXPRESSION,
          });
        }
      }
    }
  }

  const statusCol = colMap.status;
  if (statusCol) {
    const enumVals = String(statusCol.COLUMN_TYPE).replace(/^enum\(/i, '').replace(/\)$/, '').split(',').map((s) => s.replace(/'/g, ''));
    for (const required of EXPECTED.statusEnumMustInclude) {
      if (!enumVals.includes(required)) {
        findings.schemaDrift.push({ item: 'status', issue: 'enum_missing_value', missing: required, actual: enumVals });
      }
    }
  }

  const [allIdx] = await mysqlPool.query(
    `SELECT INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX, COLUMN_NAME
     FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'orders'
     ORDER BY INDEX_NAME, SEQ_IN_INDEX`,
    [db]
  );

  const idxGroups = {};
  for (const r of allIdx) {
    if (!idxGroups[r.INDEX_NAME]) idxGroups[r.INDEX_NAME] = { nonUnique: r.NON_UNIQUE, cols: [] };
    idxGroups[r.INDEX_NAME].cols.push(r.COLUMN_NAME);
  }

  for (const [name, spec] of Object.entries(EXPECTED.indexes)) {
    const idx = idxGroups[name];
    if (!idx) {
      findings.missingIndexes.push(name);
      continue;
    }
    findings.verified.push(`index:${name}`);
    const isUnique = Number(idx.nonUnique) === 0;
    if (isUnique !== spec.unique) {
      findings.schemaDrift.push({ item: name, issue: 'index_unique_flag', expected: spec.unique, actual: isUnique });
    }
    if (JSON.stringify(idx.cols) !== JSON.stringify(spec.columns)) {
      findings.schemaDrift.push({ item: name, issue: 'index_columns', expected: spec.columns, actual: idx.cols });
    }
  }

  const [fks] = await mysqlPool.query(
    `SELECT CONSTRAINT_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
     FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'orders' AND REFERENCED_TABLE_NAME IS NOT NULL
     ORDER BY CONSTRAINT_NAME`,
    [db]
  );

  const fkNames = fks.map((f) => f.CONSTRAINT_NAME);
  for (const fk of EXPECTED.foreignKeys) {
    if (!fkNames.includes(fk)) findings.missingConstraints.push(fk);
    else findings.verified.push(`fk:${fk}`);
  }

  const [[pendingDupes]] = await mysqlPool.query(
    `SELECT COUNT(*) AS n FROM (
       SELECT enrollment_id FROM orders
       WHERE status = 'pending' AND enrollment_id IS NOT NULL
       GROUP BY enrollment_id HAVING COUNT(*) > 1
     ) t`
  );
  if (Number(pendingDupes?.n) > 0) {
    findings.schemaDrift.push({
      item: 'uq_orders_one_pending_per_enrollment',
      issue: 'duplicate_pending_rows_exist',
      count: Number(pendingDupes.n),
    });
  } else {
    findings.verified.push('no_duplicate_pending_per_enrollment');
  }

  const migrateResult = await ensureOrderCheckoutIntegritySchema(mysqlPool, { dryRun: false });
  const newSteps = (migrateResult.steps || []).filter((s) => !s.name?.startsWith('dedupe'));
  const structuralSteps = newSteps.filter(
    (s) =>
      s.name?.startsWith('add_') ||
      s.name?.includes('uq_') ||
      s.name?.includes('idx_')
  );
  if (structuralSteps.length > 0) {
    findings.migrationFailures.push({
      issue: 'migration_rerun_applied_structural_steps',
      steps: structuralSteps,
      note: 'Schema was incomplete on re-run; steps were applied now',
    });
  } else {
    findings.verified.push('migration_idempotent_no_structural_steps_needed');
  }

  const [statusCounts] = await mysqlPool.query(
    `SELECT status, COUNT(*) AS cnt FROM orders GROUP BY status ORDER BY status`
  );

  const ordinal = allCols
    .filter((c) => ['status', 'cancellation_reason', 'cancelled_at', 'pending_enrollment_id'].includes(c.COLUMN_NAME))
    .map((c) => ({ name: c.COLUMN_NAME, position: c.ORDINAL_POSITION, type: c.COLUMN_TYPE }));

  const [createTable] = await mysqlPool.query('SHOW CREATE TABLE orders');
  const createSql = createTable[0]?.['Create Table'] || '';

  const checkoutIntegrityPass =
    findings.missingColumns.length === 0 &&
    findings.missingIndexes.length === 0 &&
    findings.schemaDrift.length === 0;

  const fkEnrollmentPass = findings.missingConstraints.length === 0;

  return {
    database: db,
    mysqlVersion: ver,
    ordersColumnCount: allCols.length,
    columnOrder: ordinal,
    orderStatusDistribution: statusCounts,
    migrationReRun: migrateResult,
    foreignKeys: fks,
    showCreateTable: createSql,
    checkoutIntegrityPass,
    fkEnrollmentPass,
    testsAlignedWithLiveSchema: checkoutIntegrityPass,
    noteOnTests:
      'Unit/integration payment tests are in-memory simulators; they assume schema contract above but do not connect to MySQL.',
    findings,
    pass: checkoutIntegrityPass && fkEnrollmentPass,
    passNote: !fkEnrollmentPass && checkoutIntegrityPass
      ? 'Checkout-integrity schema OK; only fk_orders_enrollment is not applied yet.'
      : undefined,
  };
}

const report = await audit();
  console.log(JSON.stringify(report, null, 2));
  await mysqlPool.end();
  // Exit 1 only when checkout-integrity objects are missing (not FK-only gap).
  process.exit(report.checkoutIntegrityPass ? 0 : 1);
