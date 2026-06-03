#!/usr/bin/env node
/**
 * CLI runner for question_bank soft-delete schema hardening.
 *
 * Usage:
 *   node scripts/run-question-bank-soft-delete-migration.mjs
 *   node scripts/run-question-bank-soft-delete-migration.mjs --dry-run
 *   node scripts/run-question-bank-soft-delete-migration.mjs --rollback --dry-run
 *   node scripts/run-question-bank-soft-delete-migration.mjs --verify
 */
import 'dotenv/config';
import { mysqlPool } from '../src/config/mysql.js';
import {
  ensureQuestionBankSoftDeleteSchema,
  rollbackQuestionBankSoftDeleteSchema,
} from '../src/db/ensureQuestionBankSoftDeleteSchema.js';

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const rollback = args.has('--rollback');
const verify = args.has('--verify');

async function runVerification() {
  const [dbRows] = await mysqlPool.query('SELECT DATABASE() AS db');
  const db = dbRows[0]?.db;

  const [columns] = await mysqlPool.query(
    `SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'question_bank'
       AND COLUMN_NAME IN ('deleted_at', 'deleted_by')
     ORDER BY ORDINAL_POSITION`,
    [db]
  );

  const [indexes] = await mysqlPool.query(
    `SELECT INDEX_NAME, COLUMN_NAME, SEQ_IN_INDEX
     FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'question_bank'
       AND INDEX_NAME IN ('idx_qb_deleted_at', 'idx_qb_active_list')
     ORDER BY INDEX_NAME, SEQ_IN_INDEX`,
    [db]
  );

  const [constraints] = await mysqlPool.query(
    `SELECT CONSTRAINT_NAME, CONSTRAINT_TYPE
     FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'question_bank'
       AND CONSTRAINT_NAME IN ('fk_qb_deleted_by', 'chk_qb_soft_delete_actor')`,
    [db]
  );

  const [[counts]] = await mysqlPool.query(
    `SELECT
       COUNT(*) AS total,
       SUM(deleted_at IS NULL) AS active,
       SUM(deleted_at IS NOT NULL) AS soft_deleted,
       SUM(deleted_at IS NOT NULL AND deleted_by IS NULL) AS soft_deleted_no_actor
     FROM question_bank`
  );

  console.log(JSON.stringify({ db, columns, indexes, constraints, counts }, null, 2));
}

async function main() {
  try {
    if (verify) {
      await runVerification();
      return;
    }

    const result = rollback
      ? await rollbackQuestionBankSoftDeleteSchema(mysqlPool, { dryRun })
      : await ensureQuestionBankSoftDeleteSchema(mysqlPool, { dryRun });

    console.log(JSON.stringify(result, null, 2));

    if (!dryRun && !rollback) {
      await runVerification();
    }
  } finally {
    await mysqlPool.end();
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
