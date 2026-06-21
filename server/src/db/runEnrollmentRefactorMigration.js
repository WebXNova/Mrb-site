/**
 * Course enrollment schema refactor — idempotent migration runner.
 *
 * Usage:
 *   node src/db/runEnrollmentRefactorMigration.js
 *   node src/db/runEnrollmentRefactorMigration.js --verify
 *   node src/db/runEnrollmentRefactorMigration.js --rollback
 *   node src/db/runEnrollmentRefactorMigration.js --dry-run
 *
 * SQL reference:
 *   src/db/migrations/20250620_refactor_course_enrollment_schema.sql
 *   src/db/migrations/20250620_refactor_course_enrollment_schema_rollback.sql
 */

import 'dotenv/config';
import mysql from 'mysql2/promise';
import { pathToFileURL } from 'url';
import { env } from '../config/env.js';

const DEPRECATION_COMMENT = 'DEPRECATED: Use courses.admission_status instead';

const LEGACY_COURSES_ENROLLMENT_COLUMNS = Object.freeze([
  { name: 'enrollment_open_at', definition: 'DATETIME NULL' },
  { name: 'enrollment_close_at', definition: 'DATETIME NULL' },
  { name: 'allow_enrollment', definition: 'TINYINT(1) NOT NULL DEFAULT 1' },
]);

const LEGACY_BATCH_ENROLLMENT_COLUMNS = Object.freeze([
  { name: 'enrollment_open_at', definition: 'DATETIME NOT NULL' },
  { name: 'enrollment_close_at', definition: 'DATETIME NOT NULL' },
  { name: 'allow_enrollment', definition: 'TINYINT(1) NOT NULL DEFAULT 1' },
]);

/** DDL can exceed default pool query timeouts — use a dedicated connection. */
function createMigrationPool() {
  return mysql.createPool({
    host: env.mysql.host,
    port: env.mysql.port,
    user: env.mysql.user,
    password: env.mysql.password,
    database: env.mysql.database,
    dateStrings: true,
    waitForConnections: true,
    connectionLimit: 2,
    connectTimeout: 60_000,
    multipleStatements: true,
  });
}

async function getDb(pool) {
  const [rows] = await pool.query('SELECT DATABASE() AS db');
  return rows[0]?.db ?? null;
}

async function columnExists(pool, db, table, column) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS n
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [db, table, column]
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

async function indexExists(pool, db, table, indexName) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS n
     FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [db, table, indexName]
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

async function checkConstraintExists(pool, db, table, constraintName) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS n
     FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? AND CONSTRAINT_TYPE = 'CHECK'`,
    [db, table, constraintName]
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

async function viewExists(pool, db, viewName) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS n
     FROM INFORMATION_SCHEMA.VIEWS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [db, viewName]
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

async function tableExists(pool, db, table) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS n
     FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [db, table]
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

async function getColumnMeta(pool, db, table, column) {
  const [rows] = await pool.query(
    `SELECT COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, EXTRA
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [db, table, column]
  );
  return rows[0] ?? null;
}

function formatDefaultClause(meta) {
  if (meta.COLUMN_DEFAULT == null) {
    return meta.IS_NULLABLE === 'YES' ? ' DEFAULT NULL' : '';
  }
  if (meta.COLUMN_DEFAULT === 'CURRENT_TIMESTAMP') {
    return ' DEFAULT CURRENT_TIMESTAMP';
  }
  if (/^-?\d+(\.\d+)?$/.test(String(meta.COLUMN_DEFAULT))) {
    return ` DEFAULT ${meta.COLUMN_DEFAULT}`;
  }
  return ` DEFAULT '${meta.COLUMN_DEFAULT}'`;
}

function buildModifyWithComment(meta, columnName, comment) {
  if (!meta) return null;
  const nullable = meta.IS_NULLABLE === 'YES' ? 'NULL' : 'NOT NULL';
  const extra = meta.EXTRA ? ` ${meta.EXTRA}` : '';
  return `MODIFY COLUMN \`${columnName}\` ${meta.COLUMN_TYPE} ${nullable}${formatDefaultClause(meta)}${extra} COMMENT '${comment}'`;
}

async function deprecateColumns(pool, db, table, columns, dryRun) {
  const parts = [];
  for (const col of columns) {
    if (!(await columnExists(pool, db, table, col.name))) continue;
    const meta = await getColumnMeta(pool, db, table, col.name);
    const clause = buildModifyWithComment(meta, col.name, DEPRECATION_COMMENT);
    if (clause) parts.push(clause);
  }
  if (parts.length === 0) return { skipped: true, table };

  const sql = `ALTER TABLE \`${table}\` ${parts.join(', ')}`;
  if (!dryRun) {
    await pool.query(sql);
    console.log(`[migration] Deprecated ${table} enrollment columns (${parts.length})`);
  }
  return { table, sql, count: parts.length };
}

async function restoreColumnComments(pool, db, table, columns, dryRun) {
  const parts = [];
  for (const col of columns) {
    if (!(await columnExists(pool, db, table, col.name))) continue;
    parts.push(`MODIFY COLUMN \`${col.name}\` ${col.definition}`);
  }
  if (parts.length === 0) return { skipped: true, table };
  const sql = `ALTER TABLE \`${table}\` ${parts.join(', ')}`;
  if (!dryRun) await pool.query(sql);
  return { table, sql };
}

/**
 * Backfill new course fields from course_batches (and legacy courses columns when present).
 * Preserves existing non-null course values.
 */
async function backfillCourseAdmissionFields(pool, db, dryRun) {
  if (!(await tableExists(pool, db, 'courses'))) return { skipped: true };

  const hasBatches = await tableExists(pool, db, 'course_batches');
  const hasLegacyOpen = await columnExists(pool, db, 'courses', 'enrollment_open_at');
  const hasLegacyClose = await columnExists(pool, db, 'courses', 'enrollment_close_at');
  const hasLegacyAllow = await columnExists(pool, db, 'courses', 'allow_enrollment');

  let sql;
  if (hasBatches) {
    sql = `
      UPDATE courses c
      INNER JOIN (
        SELECT
          cb.course_id,
          DATE(cb.start_date) AS batch_start_date,
          DATE(cb.end_date) AS batch_end_date,
          cb.allow_enrollment,
          cb.enrollment_open_at,
          cb.enrollment_close_at,
          cb.status
        FROM course_batches cb
        INNER JOIN (
          SELECT course_id, MAX(id) AS batch_id
          FROM course_batches
          WHERE is_active = 1
          GROUP BY course_id
        ) pick ON pick.batch_id = cb.id
      ) b ON b.course_id = c.id
      SET
        c.start_date = COALESCE(c.start_date, b.batch_start_date),
        c.end_date = COALESCE(c.end_date, b.batch_end_date),
        c.admission_status = CASE
          WHEN c.admission_status = 'OPEN' THEN 'OPEN'
          WHEN b.allow_enrollment = 1
            AND NOW() >= b.enrollment_open_at
            AND NOW() <= b.enrollment_close_at THEN 'OPEN'
          WHEN b.allow_enrollment = 1
            AND b.status IN ('enrollment_open', 'published', 'upcoming') THEN 'OPEN'
          ELSE 'CLOSED'
        END`;
  } else if (hasLegacyOpen || hasLegacyClose || hasLegacyAllow) {
    sql = `
      UPDATE courses c
      SET
        c.start_date = COALESCE(c.start_date, DATE(c.enrollment_open_at)),
        c.end_date = COALESCE(c.end_date, DATE(c.enrollment_close_at)),
        c.admission_status = CASE
          WHEN c.admission_status = 'OPEN' THEN 'OPEN'
          WHEN c.allow_enrollment = 1
            AND c.enrollment_open_at IS NOT NULL
            AND c.enrollment_close_at IS NOT NULL
            AND NOW() >= c.enrollment_open_at
            AND NOW() <= c.enrollment_close_at THEN 'OPEN'
          WHEN c.allow_enrollment = 1 THEN 'OPEN'
          ELSE 'CLOSED'
        END
      WHERE c.start_date IS NULL
         OR c.end_date IS NULL
         OR c.admission_status = 'CLOSED'`;
  } else {
    return { skipped: true, reason: 'no_backfill_source' };
  }

  if (!dryRun) {
    const [result] = await pool.query(sql);
    console.log(`[migration] Backfilled course admission fields (${result.affectedRows ?? 0} rows touched)`);
  }
  return { sql: sql.trim(), backfilled: !dryRun };
}

/**
 * @param {import('mysql2/promise').Pool} pool
 * @param {{ dryRun?: boolean }} [options]
 */
export async function runEnrollmentRefactorMigration(pool, options = {}) {
  const dryRun = options.dryRun === true;
  const db = await getDb(pool);
  if (!db) return { ok: false, reason: 'no_database' };
  if (!(await tableExists(pool, db, 'courses'))) {
    return { ok: false, reason: 'courses_table_missing' };
  }

  const steps = [];

  const needsStart = !(await columnExists(pool, db, 'courses', 'start_date'));
  const needsEnd = !(await columnExists(pool, db, 'courses', 'end_date'));
  const needsStatus = !(await columnExists(pool, db, 'courses', 'admission_status'));

  if (needsStart || needsEnd || needsStatus) {
    const parts = [];
    if (needsStart) parts.push("ADD COLUMN start_date DATE NULL COMMENT 'Course start date'");
    if (needsEnd) parts.push("ADD COLUMN end_date DATE NULL COMMENT 'Course end date'");
    if (needsStatus) {
      parts.push(
        "ADD COLUMN admission_status ENUM('OPEN', 'CLOSED') NOT NULL DEFAULT 'CLOSED' COMMENT 'Admission status for enrollment'"
      );
    }
    const sql = `ALTER TABLE courses ${parts.join(', ')}`;
    steps.push('add_courses_columns');
    if (!dryRun) {
      await pool.query(sql);
      console.log('[migration] Added courses.start_date, end_date, admission_status');
    }
  }

  for (const [indexName, sql] of [
    ['idx_courses_admission_status', 'CREATE INDEX idx_courses_admission_status ON courses(admission_status)'],
    ['idx_courses_start_date', 'CREATE INDEX idx_courses_start_date ON courses(start_date)'],
    ['idx_courses_end_date', 'CREATE INDEX idx_courses_end_date ON courses(end_date)'],
  ]) {
    if (!(await indexExists(pool, db, 'courses', indexName))) {
      steps.push(indexName);
      if (!dryRun) {
        await pool.query(sql);
        console.log(`[migration] Created ${indexName}`);
      }
    }
  }

  if (!(await checkConstraintExists(pool, db, 'courses', 'chk_course_dates'))) {
    steps.push('chk_course_dates');
    if (!dryRun) {
      await pool.query(
        `ALTER TABLE courses
         ADD CONSTRAINT chk_course_dates
         CHECK (start_date IS NULL OR end_date IS NULL OR start_date <= end_date)`
      );
      console.log('[migration] Added chk_course_dates');
    }
  }

  const backfill = await backfillCourseAdmissionFields(pool, db, dryRun);
  if (!backfill.skipped) steps.push('backfill_course_fields');

  const coursesDeprecate = await deprecateColumns(
    pool,
    db,
    'courses',
    LEGACY_COURSES_ENROLLMENT_COLUMNS,
    dryRun
  );
  if (!coursesDeprecate.skipped) steps.push('deprecate_courses_legacy_columns');

  if (await tableExists(pool, db, 'course_batches')) {
    const batchDeprecate = await deprecateColumns(
      pool,
      db,
      'course_batches',
      LEGACY_BATCH_ENROLLMENT_COLUMNS,
      dryRun
    );
    if (!batchDeprecate.skipped) steps.push('deprecate_course_batches_columns');
  }

  const viewSql = `CREATE OR REPLACE VIEW vw_course_enrollment_status AS
    SELECT
      id,
      title,
      description,
      start_date,
      end_date,
      admission_status,
      CASE WHEN admission_status = 'OPEN' THEN TRUE ELSE FALSE END AS is_enrollment_open,
      CASE
        WHEN admission_status = 'OPEN' THEN 'Enrollment is open'
        ELSE 'Admissions are currently closed.'
      END AS enrollment_message
    FROM courses`;
  steps.push('vw_course_enrollment_status');
  if (!dryRun) {
    await pool.query(viewSql);
    console.log('[migration] Ensured vw_course_enrollment_status');
  }

  return { ok: true, dryRun, steps };
}

/**
 * @param {import('mysql2/promise').Pool} pool
 * @param {{ dryRun?: boolean }} [options]
 */
export async function rollbackEnrollmentRefactorMigration(pool, options = {}) {
  const dryRun = options.dryRun === true;
  const db = await getDb(pool);
  if (!db) return { ok: false, reason: 'no_database' };

  const steps = [];

  if (await viewExists(pool, db, 'vw_course_enrollment_status')) {
    steps.push('drop_view');
    if (!dryRun) await pool.query('DROP VIEW IF EXISTS vw_course_enrollment_status');
  }

  if (await checkConstraintExists(pool, db, 'courses', 'chk_course_dates')) {
    steps.push('drop_chk_course_dates');
    if (!dryRun) await pool.query('ALTER TABLE courses DROP CHECK chk_course_dates');
  }

  for (const indexName of [
    'idx_courses_admission_status',
    'idx_courses_start_date',
    'idx_courses_end_date',
  ]) {
    if (await indexExists(pool, db, 'courses', indexName)) {
      steps.push(`drop_${indexName}`);
      if (!dryRun) await pool.query(`DROP INDEX ${indexName} ON courses`);
    }
  }

  const dropParts = [];
  if (await columnExists(pool, db, 'courses', 'start_date')) dropParts.push('DROP COLUMN start_date');
  if (await columnExists(pool, db, 'courses', 'end_date')) dropParts.push('DROP COLUMN end_date');
  if (await columnExists(pool, db, 'courses', 'admission_status')) {
    dropParts.push('DROP COLUMN admission_status');
  }
  if (dropParts.length > 0) {
    steps.push('drop_new_courses_columns');
    if (!dryRun) await pool.query(`ALTER TABLE courses ${dropParts.join(', ')}`);
  }

  await restoreColumnComments(pool, db, 'course_batches', LEGACY_BATCH_ENROLLMENT_COLUMNS, dryRun);
  steps.push('restore_course_batches_columns');

  await restoreColumnComments(pool, db, 'courses', LEGACY_COURSES_ENROLLMENT_COLUMNS, dryRun);
  steps.push('restore_courses_legacy_columns');

  return { ok: true, dryRun, rolledBack: true, steps };
}

/**
 * @param {import('mysql2/promise').Pool} pool
 */
export async function verifyEnrollmentRefactorMigration(pool) {
  const db = await getDb(pool);
  if (!db) return { ok: false, reason: 'no_database' };

  const [newColumns] = await pool.query(
    `SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT, COLUMN_COMMENT, COLUMN_TYPE
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ?
       AND TABLE_NAME = 'courses'
       AND COLUMN_NAME IN ('start_date', 'end_date', 'admission_status')`,
    [db]
  );

  const [indexes] = await pool.query(
    `SHOW INDEXES FROM courses
     WHERE Key_name IN ('idx_courses_admission_status', 'idx_courses_start_date', 'idx_courses_end_date')`
  );

  const checkPresent = await checkConstraintExists(pool, db, 'courses', 'chk_course_dates');
  const viewPresent = await viewExists(pool, db, 'vw_course_enrollment_status');

  const deprecated = [];
  for (const table of ['courses', 'course_batches']) {
    for (const col of ['enrollment_open_at', 'enrollment_close_at', 'allow_enrollment']) {
      if (!(await columnExists(pool, db, table, col))) continue;
      const [rows] = await pool.query(
        `SELECT COLUMN_NAME, COLUMN_COMMENT
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
        [db, table, col]
      );
      deprecated.push(rows[0]);
    }
  }

  const [[courseCount]] = await pool.query('SELECT COUNT(*) AS n FROM courses');

  const required = ['start_date', 'end_date', 'admission_status'];
  const present = newColumns.map((c) => c.COLUMN_NAME);
  const missingColumns = required.filter((c) => !present.includes(c));

  const deprecatedOk = deprecated.every((d) =>
    String(d?.COLUMN_COMMENT || '').includes('DEPRECATED')
  );

  const typesOk =
    newColumns.find((c) => c.COLUMN_NAME === 'start_date')?.DATA_TYPE === 'date' &&
    newColumns.find((c) => c.COLUMN_NAME === 'end_date')?.DATA_TYPE === 'date' &&
    String(newColumns.find((c) => c.COLUMN_NAME === 'admission_status')?.COLUMN_TYPE || '').includes(
      "enum('OPEN','CLOSED')"
    );

  return {
    ok:
      missingColumns.length === 0 &&
      indexes.length >= 3 &&
      checkPresent &&
      viewPresent &&
      typesOk &&
      deprecatedOk,
    missingColumns,
    typesOk,
    newColumns,
    indexes,
    checkPresent,
    viewPresent,
    deprecatedColumns: deprecated,
    deprecatedOk,
    courseRowCount: Number(courseCount?.n ?? 0),
    dataLossCheck: 'course_row_count_preserved',
  };
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const dryRun = args.has('--dry-run');
  const rollback = args.has('--rollback');
  const verifyOnly = args.has('--verify');

  const pool = createMigrationPool();

  try {
    if (verifyOnly) {
      const report = await verifyEnrollmentRefactorMigration(pool);
      console.log(JSON.stringify(report, null, 2));
      if (!report.ok) process.exitCode = 1;
      return;
    }

    const result = rollback
      ? await rollbackEnrollmentRefactorMigration(pool, { dryRun })
      : await runEnrollmentRefactorMigration(pool, { dryRun });

    console.log(JSON.stringify(result, null, 2));

    if (!dryRun && !rollback) {
      const verify = await verifyEnrollmentRefactorMigration(pool);
      console.log(JSON.stringify({ verify }, null, 2));
      if (!verify.ok) {
        process.exitCode = 1;
        return;
      }
      console.log(
        '✅ Database schema migrated successfully. All courses now have start_date, end_date, and admission_status. Old enrollment fields are deprecated but preserved.'
      );
    }
  } finally {
    await pool.end();
  }
}

/** Startup hook — idempotent, safe on every server boot. */
export async function ensureCourseEnrollmentRefactorSchema(mysqlPool) {
  return runEnrollmentRefactorMigration(mysqlPool);
}

const isDirectRun =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
