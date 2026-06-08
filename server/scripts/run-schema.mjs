#!/usr/bin/env node
/**
 * Apply canonical schema.sql to the configured database (idempotent hooks included).
 *
 * Usage:
 *   node scripts/run-schema.mjs
 */
import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { mysqlPool } from '../src/config/mysql.js';
import { ensureTestsApplicationSchema } from '../src/db/ensureTestsApplicationSchema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function runSchema() {
  const schemaPath = path.join(__dirname, '../src/sql/schema.sql');
  const schemaSql = await fs.readFile(schemaPath, 'utf-8');
  const statements = schemaSql
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);

  for (const [index, statement] of statements.entries()) {
    try {
      await mysqlPool.query(statement);
    } catch (error) {
      const snippet = statement.slice(0, 140).replace(/\s+/g, ' ');
      throw new Error(`Schema migration failed at statement ${index + 1}: ${snippet}. ${error.message}`);
    }
  }
}

async function verifyCompletionReason() {
  const [dbRows] = await mysqlPool.query('SELECT DATABASE() AS db');
  const db = dbRows[0]?.db;
  const [columns] = await mysqlPool.query(
    `SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'test_attempts' AND COLUMN_NAME = 'completion_reason'`,
    [db]
  );
  console.log(JSON.stringify({ db, completionReasonColumn: columns[0] ?? null }, null, 2));
}

async function main() {
  try {
    console.log('[schema] Applying schema.sql...');
    await runSchema();
    await ensureTestsApplicationSchema(mysqlPool);
    console.log('[schema] Done.');
    await verifyCompletionReason();
  } finally {
    await mysqlPool.end();
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
