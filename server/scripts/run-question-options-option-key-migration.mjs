/**
 * Apply question_options.option_key migration (required for quiz publish materialization).
 *
 * Usage: node scripts/run-question-options-option-key-migration.mjs
 */
import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { verifyMySqlConnection, mysqlPool } from '../src/config/mysql.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TRIGGER_INSERT = `
CREATE TRIGGER trg_qo_single_correct_before_insert
BEFORE INSERT ON question_options
FOR EACH ROW
BEGIN
  IF NEW.is_correct = 1 THEN
    IF (
      SELECT COUNT(*) FROM question_options
      WHERE question_id = NEW.question_id AND is_correct = 1
    ) > 0 THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Only one correct option allowed per question';
    END IF;
  END IF;
END
`;

const TRIGGER_UPDATE = `
CREATE TRIGGER trg_qo_single_correct_before_update
BEFORE UPDATE ON question_options
FOR EACH ROW
BEGIN
  IF NEW.is_correct = 1 AND OLD.is_correct = 0 THEN
    IF (
      SELECT COUNT(*) FROM question_options
      WHERE question_id = NEW.question_id AND is_correct = 1 AND id <> NEW.id
    ) > 0 THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Only one correct option allowed per question';
    END IF;
  END IF;
END
`;

async function main() {
  await verifyMySqlConnection();

  const migrationPath = path.join(__dirname, '../src/sql/migrations/question_options_option_key.sql');
  let sql = await fs.readFile(migrationPath, 'utf-8');
  const delimiterIndex = sql.indexOf('DELIMITER $$');
  if (delimiterIndex >= 0) {
    sql = sql.slice(0, delimiterIndex);
  }

  const connection = await mysqlPool.getConnection();
  try {
    await connection.query(sql);
    await connection.query('DROP TRIGGER IF EXISTS trg_qo_single_correct_before_insert');
    await connection.query('DROP TRIGGER IF EXISTS trg_qo_single_correct_before_update');
    try {
      await connection.query(TRIGGER_INSERT);
      await connection.query(TRIGGER_UPDATE);
      console.log('Triggers created.');
    } catch (triggerError) {
      console.warn(
        'Triggers skipped (column migration still applied):',
        triggerError.message || triggerError
      );
    }
  } finally {
    connection.release();
  }

  const [[column]] = await mysqlPool.query(
    `SELECT COUNT(*) AS present
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'question_options'
       AND COLUMN_NAME = 'option_key'`
  );

  console.log('option_key column present:', Number(column?.present) > 0);
  await mysqlPool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
