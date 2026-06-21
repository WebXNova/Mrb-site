#!/usr/bin/env node
/**
 * orders.enrollment_id → enrollments.id FK migration runner.
 *
 * Usage:
 *   node scripts/run-orders-enrollment-fk-migration.mjs --analyze
 *   node scripts/run-orders-enrollment-fk-migration.mjs --dry-run
 *   node scripts/run-orders-enrollment-fk-migration.mjs --dry-run --repair
 *   node scripts/run-orders-enrollment-fk-migration.mjs --repair   (remediate then add FK)
 *   node scripts/run-orders-enrollment-fk-migration.mjs --verify
 *   node scripts/run-orders-enrollment-fk-migration.mjs --rollback --dry-run
 */
import 'dotenv/config';
import { mysqlPool } from '../src/config/mysql.js';
import {
  analyzeOrdersEnrollmentOrphans,
  ensureOrdersEnrollmentFk,
  rollbackOrdersEnrollmentFk,
} from '../src/db/ensureOrdersEnrollmentFkSchema.js';

const args = new Set(process.argv.slice(2));
const analyze = args.has('--analyze');
const dryRun = args.has('--dry-run');
const repair = args.has('--repair');
const verify = args.has('--verify');
const rollback = args.has('--rollback');

async function runVerify() {
  const analysis = await analyzeOrdersEnrollmentOrphans(mysqlPool);
  const [[fk]] = await mysqlPool.query(
    `SELECT CONSTRAINT_NAME, DELETE_RULE, UPDATE_RULE
     FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS
     WHERE CONSTRAINT_SCHEMA = DATABASE()
       AND TABLE_NAME = 'orders'
       AND CONSTRAINT_NAME = 'fk_orders_enrollment'`
  );
  console.log(JSON.stringify({ analysis, fk: fk ?? null }, null, 2));
}

async function main() {
  try {
    if (analyze) {
      const analysis = await analyzeOrdersEnrollmentOrphans(mysqlPool);
      console.log(JSON.stringify({ mode: 'analyze', ...analysis }, null, 2));
      if (!analysis.canAddFk) process.exitCode = 1;
      return;
    }

    if (verify) {
      await runVerify();
      return;
    }

    const result = rollback
      ? await rollbackOrdersEnrollmentFk(mysqlPool, { dryRun })
      : await ensureOrdersEnrollmentFk(mysqlPool, { dryRun, forceRepair: repair });

    console.log(JSON.stringify(result, null, 2));

    if (result.blocked) process.exitCode = 1;
    else if (!dryRun && !rollback && result.ok) await runVerify();
  } finally {
    await mysqlPool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
