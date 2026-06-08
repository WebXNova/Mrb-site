/**
 * Ensures test_subjects junction and tests column refactor on existing databases.
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { runTestSubjectsBackfill } from '../services/backfillTestSubjects.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function tableExists(pool, db, tableName) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [db, tableName]
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

async function columnExists(pool, db, tableName, columnName) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS n
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [db, tableName, columnName]
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

export async function ensureTestSubjectsSchema(mysqlPool) {
  const [dbRows] = await mysqlPool.query('SELECT DATABASE() AS db');
  const db = dbRows[0]?.db;
  if (!db) return;

  if (!(await tableExists(mysqlPool, db, 'tests'))) return;

  const migrationPath = path.join(__dirname, '../sql/migrations/tests_type_category_subject_refactor.sql');
  const sql = await fs.readFile(migrationPath, 'utf-8');
  const statements = sql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith('--'));

  for (const statement of statements) {
    try {
      await mysqlPool.query(statement);
    } catch (error) {
      const snippet = statement.slice(0, 100).replace(/\s+/g, ' ');
      console.warn(`[schema] test subjects migration skipped/failed: ${snippet} — ${error.message}`);
    }
  }

  if (await tableExists(mysqlPool, db, 'test_subjects')) {
    console.log('[schema] test_subjects ready');
    setImmediate(() => {
      runTestSubjectsBackfill(mysqlPool)
        .then((summary) => {
          console.log('[schema] test subjects backfill:', summary);
          if (summary.stillMissingSubjects > 0) {
            console.log(
              `[schema] ${summary.stillMissingSubjects} test(s) still have no course subjects — remain INCOMPLETE until Step 1 is re-saved`
            );
          }
        })
        .catch((error) => {
          console.warn('[schema] test subjects backfill failed:', error.message);
        });
    });
  }

  if (await columnExists(mysqlPool, db, 'tests', 'sub_category')) {
    console.warn('[schema] tests.sub_category still present — run migration manually if needed');
    try {
      await mysqlPool.query('ALTER TABLE tests DROP COLUMN sub_category');
      console.log('[schema] Dropped tests.sub_category');
    } catch (error) {
      console.warn('[schema] Could not drop sub_category:', error.message);
    }
  }
}
