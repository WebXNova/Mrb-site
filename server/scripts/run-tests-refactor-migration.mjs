/**
 * Apply tests type/category/subjects refactor to the configured database.
 */
import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { verifyMySqlConnection, mysqlPool } from '../src/config/mysql.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  await verifyMySqlConnection();
  const migrationPath = path.join(__dirname, '../src/sql/migrations/tests_type_category_subject_refactor.sql');
  const sql = await fs.readFile(migrationPath, 'utf-8');
  const statements = sql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith('--'));

  for (const [index, statement] of statements.entries()) {
    try {
      await mysqlPool.query(statement);
      console.log(`OK ${index + 1}/${statements.length}`);
    } catch (error) {
      console.error(`Failed statement ${index + 1}:`, statement.slice(0, 120));
      throw error;
    }
  }

  const [cols] = await mysqlPool.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tests' AND COLUMN_NAME = 'sub_category'`
  );
  const [ts] = await mysqlPool.query(
    `SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'test_subjects'`
  );
  console.log('sub_category present:', cols.length > 0);
  console.log('test_subjects table:', Number(ts[0]?.n) > 0);
  await mysqlPool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
