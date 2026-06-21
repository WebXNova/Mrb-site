#!/usr/bin/env node
/**
 * Apply LMS pre-delivery schema patches (idempotent).
 *
 * Usage:
 *   node scripts/run-lms-schema-patches.mjs
 */
import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { mysqlPool } from '../src/config/mysql.js';
import { ensureTestsApplicationSchema } from '../src/db/ensureTestsApplicationSchema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function runSqlFile(relativePath) {
  const filePath = path.join(__dirname, '..', relativePath);
  const sql = await fs.readFile(filePath, 'utf-8');
  await mysqlPool.query(sql);
  console.log(`[schema] Applied ${relativePath}`);
}

async function verify() {
  const [dbRows] = await mysqlPool.query('SELECT DATABASE() AS db');
  const db = dbRows[0]?.db;

  const [completionReason] = await mysqlPool.query(
    `SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'test_attempts' AND COLUMN_NAME = 'completion_reason'`,
    [db]
  );

  const [testsFields] = await mysqlPool.query(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'tests'
       AND COLUMN_NAME IN ('course_id', 'duration_minutes', 'max_attempts', 'passing_marks', 'status')`,
    [db]
  );

  console.log(
    JSON.stringify(
      {
        db,
        testAttemptsCompletionReason: completionReason[0] ?? null,
        testsVerifiedColumns: testsFields.map((row) => row.COLUMN_NAME),
      },
      null,
      2
    )
  );
}

async function main() {
  try {
    await runSqlFile('src/sql/migrations/test_attempts_completion_reason.sql');
    await ensureTestsApplicationSchema(mysqlPool);
    await verify();
  } finally {
    await mysqlPool.end();
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
