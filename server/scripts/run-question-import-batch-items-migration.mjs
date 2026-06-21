#!/usr/bin/env node
/**
 * CLI runner for question_import_batch_items audit linkage table.
 *
 * Usage:
 *   node scripts/run-question-import-batch-items-migration.mjs
 *   node scripts/run-question-import-batch-items-migration.mjs --dry-run
 *   node scripts/run-question-import-batch-items-migration.mjs --verify
 */
import 'dotenv/config';
import { mysqlPool } from '../src/config/mysql.js';
import { ensureQuestionImportBatchItemsSchema } from '../src/db/ensureQuestionImportBatchItemsSchema.js';

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const verify = args.has('--verify');

async function runVerification() {
  const [dbRows] = await mysqlPool.query('SELECT DATABASE() AS db');
  const db = dbRows[0]?.db;

  const [tables] = await mysqlPool.query(
    `SELECT TABLE_NAME
     FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN ('question_import_batches', 'question_import_batch_items')`,
    [db]
  );

  const [columns] = await mysqlPool.query(
    `SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'question_import_batch_items'
     ORDER BY ORDINAL_POSITION`,
    [db]
  );

  const [indexes] = await mysqlPool.query(
    `SELECT INDEX_NAME, COLUMN_NAME, SEQ_IN_INDEX, NON_UNIQUE
     FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'question_import_batch_items'
     ORDER BY INDEX_NAME, SEQ_IN_INDEX`,
    [db]
  );

  const [constraints] = await mysqlPool.query(
    `SELECT CONSTRAINT_NAME, CONSTRAINT_TYPE
     FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'question_import_batch_items'
     ORDER BY CONSTRAINT_NAME`,
    [db]
  );

  const [[counts]] = await mysqlPool.query(
    `SELECT
       (SELECT COUNT(*) FROM question_import_batches) AS batch_count,
       (SELECT COUNT(*) FROM question_import_batch_items) AS item_count,
       (SELECT COUNT(*) FROM question_import_batch_items WHERE status = 'SUCCESS') AS success_items,
       (SELECT COUNT(*) FROM question_import_batch_items WHERE status = 'FAILED') AS failed_items`
  );

  console.log(JSON.stringify({ db, tables, columns, indexes, constraints, counts }, null, 2));
}

async function main() {
  try {
    if (verify) {
      await runVerification();
      return;
    }

    const result = await ensureQuestionImportBatchItemsSchema(mysqlPool, { dryRun });
    console.log(JSON.stringify(result, null, 2));

    if (!dryRun) {
      await runVerification();
    }
  } finally {
    await mysqlPool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
