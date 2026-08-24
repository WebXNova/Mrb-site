#!/usr/bin/env node
/**
 * CLI runner for test engine extension schema migration.
 *
 * Usage:
 *   node scripts/run-test-engine-extension-migration.mjs
 *   node scripts/run-test-engine-extension-migration.mjs --dry-run
 *   node scripts/run-test-engine-extension-migration.mjs --rollback
 *   node scripts/run-test-engine-extension-migration.mjs --rollback --dry-run
 *   node scripts/run-test-engine-extension-migration.mjs --verify
 */
import 'dotenv/config';
import { mysqlPool } from '../src/config/mysql.js';
import {
  ensureTestEngineExtensionSchema,
  rollbackTestEngineExtensionSchema,
} from '../src/db/ensureTestEngineExtensionSchema.js';

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const rollback = args.has('--rollback');
const verify = args.has('--verify');

const EXPECTED = {
  tables: ['test_sections', 'test_score_bands', 'test_cheating_violations'],
  testsColumns: ['layout_mode', 'display_mode', 'results_released_at', 'full_page_mode'],
  questionBankColumns: ['tip_html'],
  testQuestionsColumns: ['section_id'],
  testAttemptsColumns: ['is_flagged_cheating'],
};

async function runVerification() {
  const [dbRows] = await mysqlPool.query('SELECT DATABASE() AS db');
  const db = dbRows[0]?.db;

  const [tables] = await mysqlPool.query(
    `SELECT TABLE_NAME
     FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN (?, ?, ?)`,
    [db, ...EXPECTED.tables]
  );

  const [testsCols] = await mysqlPool.query(
    `SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'tests'
       AND COLUMN_NAME IN (?, ?, ?, ?)
     ORDER BY ORDINAL_POSITION`,
    [db, ...EXPECTED.testsColumns]
  );

  const [qbCols] = await mysqlPool.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'question_bank' AND COLUMN_NAME = 'tip_html'`,
    [db]
  );

  const [tqCols] = await mysqlPool.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'test_questions' AND COLUMN_NAME = 'section_id'`,
    [db]
  );

  const [taCols] = await mysqlPool.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'test_attempts' AND COLUMN_NAME = 'is_flagged_cheating'`,
    [db]
  );

  const [fks] = await mysqlPool.query(
    `SELECT CONSTRAINT_NAME, TABLE_NAME
     FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = ? AND CONSTRAINT_TYPE = 'FOREIGN KEY'
       AND CONSTRAINT_NAME IN ('fk_tq_section', 'fk_ts_test', 'fk_tsb_test', 'fk_tcv_attempt')`,
    [db]
  );

  console.log(JSON.stringify({ db, tables, testsCols, qbCols, tqCols, taCols, fks }, null, 2));
}

async function main() {
  try {
    if (verify) {
      await runVerification();
      return;
    }

    if (rollback) {
      const result = await rollbackTestEngineExtensionSchema(mysqlPool, { dryRun });
      console.log(JSON.stringify(result, null, 2));
      if (!dryRun) await runVerification();
      return;
    }

    const result = await ensureTestEngineExtensionSchema(mysqlPool, { dryRun });
    console.log(JSON.stringify(result, null, 2));
    if (!dryRun) await runVerification();
  } finally {
    await mysqlPool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
