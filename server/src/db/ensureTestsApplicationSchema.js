/**
 * Ensures assessment tables expose columns expected by test.service, testAttempt,
 * and student portal on databases bootstrapped from canonical schema.sql.
 */

import { ensurePassingMarksMigration } from './ensurePassingMarksMigration.js';

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

async function indexExists(pool, db, tableName, indexName) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS n
     FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [db, tableName, indexName]
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

async function addColumn(pool, db, tableName, columnName, ddl) {
  if (await columnExists(pool, db, tableName, columnName)) return;
  await pool.query(`ALTER TABLE ${tableName} ADD COLUMN ${ddl}`);
  console.log(`[schema] Added ${tableName}.${columnName}`);
}

async function ensureTestsColumns(pool, db) {
  if (!(await tableExists(pool, db, 'tests'))) return;

  await addColumn(pool, db, 'tests', 'subject', 'subject VARCHAR(80) NULL AFTER description');
  await addColumn(pool, db, 'tests', 'category', 'category VARCHAR(80) NULL AFTER subject');
  await addColumn(pool, db, 'tests', 'negative_marking', 'negative_marking DECIMAL(5,2) NOT NULL DEFAULT 0 AFTER max_attempts');
  await addColumn(pool, db, 'tests', 'show_explanations', 'show_explanations TINYINT(1) NOT NULL DEFAULT 1 AFTER shuffle_options');
  await addColumn(pool, db, 'tests', 'access_mode', "access_mode VARCHAR(20) NOT NULL DEFAULT 'private' AFTER show_explanations");
  await addColumn(pool, db, 'tests', 'tags_json', 'tags_json TEXT NULL AFTER access_mode');
  await addColumn(pool, db, 'tests', 'public_slug', 'public_slug VARCHAR(120) NULL AFTER status');

  if (!(await indexExists(pool, db, 'tests', 'idx_tests_public_slug'))) {
    await pool.query('ALTER TABLE tests ADD UNIQUE KEY idx_tests_public_slug (public_slug)');
    console.log('[schema] Added tests.idx_tests_public_slug');
  }

  const [testTypeMeta] = await pool.query(
    `SELECT COLUMN_DEFAULT AS column_default
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'tests' AND COLUMN_NAME = 'test_type'`,
    [db]
  );
  if (testTypeMeta[0] && testTypeMeta[0].column_default == null) {
    await pool.query(
      `ALTER TABLE tests MODIFY COLUMN test_type VARCHAR(50) NOT NULL DEFAULT 'subject_wise'`
    );
    console.log('[schema] Set tests.test_type default');
  }
}

async function ensureTestAttemptsColumns(pool, db) {
  if (!(await tableExists(pool, db, 'test_attempts'))) return;

  await addColumn(pool, db, 'test_attempts', 'user_id', 'user_id BIGINT NULL AFTER student_id');
  await addColumn(pool, db, 'test_attempts', 'student_name', 'student_name VARCHAR(255) NULL AFTER user_id');
  await addColumn(pool, db, 'test_attempts', 'access_code_label', "access_code_label VARCHAR(64) NULL DEFAULT 'DIRECT' AFTER student_name");
  await addColumn(pool, db, 'test_attempts', 'expires_at', 'expires_at DATETIME NULL AFTER started_at');
  await addColumn(pool, db, 'test_attempts', 'last_activity_at', 'last_activity_at DATETIME NULL AFTER expires_at');
  await addColumn(pool, db, 'test_attempts', 'ip_address', 'ip_address VARCHAR(64) NULL AFTER last_activity_at');
  await addColumn(pool, db, 'test_attempts', 'user_agent', 'user_agent TEXT NULL AFTER ip_address');
  await addColumn(pool, db, 'test_attempts', 'device_fingerprint', 'device_fingerprint VARCHAR(128) NULL AFTER user_agent');
  await addColumn(pool, db, 'test_attempts', 'used_code_hash', 'used_code_hash VARCHAR(128) NULL AFTER device_fingerprint');
  await addColumn(pool, db, 'test_attempts', 'attempt_nonce', 'attempt_nonce VARCHAR(64) NULL AFTER used_code_hash');
  await addColumn(pool, db, 'test_attempts', 'delivery_layout_json', 'delivery_layout_json JSON NULL AFTER attempt_nonce');
  await addColumn(pool, db, 'test_attempts', 'result_id', 'result_id BIGINT NULL AFTER delivery_layout_json');
  await addColumn(pool, db, 'test_attempts', 'completion_reason', 'completion_reason VARCHAR(50) NULL AFTER submitted_at');

  if (
    (await columnExists(pool, db, 'test_attempts', 'user_id')) &&
    (await columnExists(pool, db, 'test_attempts', 'student_id'))
  ) {
    await pool.query(
      `UPDATE test_attempts SET user_id = student_id WHERE user_id IS NULL AND student_id IS NOT NULL`
    );
  }
}

async function ensureTestResultsColumns(pool, db) {
  if (!(await tableExists(pool, db, 'test_results'))) return;

  await addColumn(pool, db, 'test_results', 'max_score', 'max_score DECIMAL(10,2) NULL AFTER score');
  await addColumn(pool, db, 'test_results', 'correct_count', 'correct_count INT NULL AFTER max_score');
  await addColumn(pool, db, 'test_results', 'wrong_count', 'wrong_count INT NULL AFTER correct_count');
  await addColumn(pool, db, 'test_results', 'skipped_count', 'skipped_count INT NULL AFTER wrong_count');
  await addColumn(pool, db, 'test_results', 'time_taken_seconds', 'time_taken_seconds INT NULL AFTER skipped_count');
  await addColumn(pool, db, 'test_results', 'detail_json', 'detail_json LONGTEXT NULL AFTER time_taken_seconds');
}

export async function ensureTestsApplicationSchema(mysqlPool) {
  const [dbRows] = await mysqlPool.query('SELECT DATABASE() AS db');
  const db = dbRows[0]?.db;
  if (!db) return;

  await ensureTestsColumns(mysqlPool, db);
  await ensureTestAttemptsColumns(mysqlPool, db);
  await ensureTestResultsColumns(mysqlPool, db);

  const migrationResult = await ensurePassingMarksMigration(mysqlPool);
  if (migrationResult?.steps?.length) {
    console.log('[schema] Passing marks migration applied:', migrationResult.steps.join(', '));
  }
}
