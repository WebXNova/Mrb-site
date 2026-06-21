/**
 * Idempotent schema patch: test_import_batches audit table.
 */

const MIGRATION_NAME = 'test_import_batches';

async function tableExists(pool, db, tableName) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [db, tableName]
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS test_import_batches (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  uploaded_by BIGINT NOT NULL,
  source_type VARCHAR(50) NOT NULL DEFAULT 'rich_json',
  file_name VARCHAR(255) NULL,
  target_course_id BIGINT NOT NULL,
  target_test_id BIGINT NULL,
  total_questions INT NOT NULL DEFAULT 0,
  status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
  error_code VARCHAR(100) NULL,
  error_message VARCHAR(1000) NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_test_import_batches_uploaded_by (uploaded_by),
  KEY idx_test_import_batches_course (target_course_id),
  KEY idx_test_import_batches_test (target_test_id),
  KEY idx_test_import_batches_status (status),
  CONSTRAINT fk_test_import_batches_user FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_test_import_batches_course FOREIGN KEY (target_course_id) REFERENCES courses(id) ON DELETE CASCADE,
  CONSTRAINT fk_test_import_batches_test FOREIGN KEY (target_test_id) REFERENCES tests(id) ON DELETE SET NULL,
  CONSTRAINT chk_test_import_batch_status CHECK (status IN ('PENDING', 'COMPLETED', 'FAILED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

/**
 * @param {import('mysql2/promise').Pool} mysqlPool
 * @param {{ dryRun?: boolean }} [opts]
 */
export async function ensureTestImportBatchesSchema(mysqlPool, { dryRun = false } = {}) {
  const [dbRows] = await mysqlPool.query('SELECT DATABASE() AS db');
  const db = dbRows[0]?.db;
  if (!db) {
    return { migration: MIGRATION_NAME, skipped: true, reason: 'no_database' };
  }

  if (!(await tableExists(mysqlPool, db, 'users'))) {
    return { migration: MIGRATION_NAME, skipped: true, reason: 'users_missing' };
  }

  if (!(await tableExists(mysqlPool, db, 'courses'))) {
    return { migration: MIGRATION_NAME, skipped: true, reason: 'courses_missing' };
  }

  if (await tableExists(mysqlPool, db, 'test_import_batches')) {
    return { migration: MIGRATION_NAME, applied: false, action: 'noop' };
  }

  if (dryRun) {
    return { migration: MIGRATION_NAME, dryRun: true, action: 'create_test_import_batches' };
  }

  await mysqlPool.query(CREATE_TABLE_SQL);
  console.log('[schema] Created test_import_batches');
  return { migration: MIGRATION_NAME, applied: true, action: 'created' };
}
