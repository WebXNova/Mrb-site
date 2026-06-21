#!/usr/bin/env node
/**
 * CLI runner for order checkout integrity schema migration.
 *
 * Usage:
 *   node scripts/run-order-checkout-integrity-migration.mjs
 *   node scripts/run-order-checkout-integrity-migration.mjs --dry-run
 *   node scripts/run-order-checkout-integrity-migration.mjs --rollback --dry-run
 *   node scripts/run-order-checkout-integrity-migration.mjs --verify
 */
import 'dotenv/config';
import { mysqlPool } from '../src/config/mysql.js';
import {
  ensureOrderCheckoutIntegritySchema,
  rollbackOrderCheckoutIntegritySchema,
} from '../src/db/ensureOrderCheckoutIntegritySchema.js';

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const rollback = args.has('--rollback');
const verify = args.has('--verify');

async function runVerification() {
  const [dbRows] = await mysqlPool.query('SELECT DATABASE() AS db');
  const db = dbRows[0]?.db;

  const [columns] = await mysqlPool.query(
    `SELECT COLUMN_NAME, COLUMN_TYPE, GENERATION_EXPRESSION
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'orders'
       AND COLUMN_NAME IN ('cancellation_reason', 'cancelled_at', 'pending_enrollment_id')
     ORDER BY ORDINAL_POSITION`,
    [db]
  );

  const [indexes] = await mysqlPool.query(
    `SELECT INDEX_NAME, NON_UNIQUE, COLUMN_NAME
     FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'orders'
       AND INDEX_NAME IN ('uq_orders_one_pending_per_enrollment', 'idx_orders_enrollment_status')
     ORDER BY INDEX_NAME, SEQ_IN_INDEX`,
    [db]
  );

  const [[pendingDupes]] = await mysqlPool.query(
    `SELECT COUNT(*) AS enrollment_groups_with_multiple_pending
     FROM (
       SELECT enrollment_id
       FROM orders
       WHERE status = 'pending' AND enrollment_id IS NOT NULL
       GROUP BY enrollment_id
       HAVING COUNT(*) > 1
     ) t`
  );

  console.log(JSON.stringify({ db, columns, indexes, pendingDupes }, null, 2));
}

async function main() {
  try {
    if (verify) {
      await runVerification();
      return;
    }

    const result = rollback
      ? await rollbackOrderCheckoutIntegritySchema(mysqlPool, { dryRun })
      : await ensureOrderCheckoutIntegritySchema(mysqlPool, { dryRun });

    console.log(JSON.stringify(result, null, 2));

    if (!dryRun && !rollback) {
      await runVerification();
    }
  } finally {
    await mysqlPool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
