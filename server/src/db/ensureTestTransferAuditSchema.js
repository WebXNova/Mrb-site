/**
 * Idempotent schema: test_export_batches + hardened test_import_batches columns.
 */

import { ensureTestImportBatchesSchema } from './ensureTestImportBatchesSchema.js';

const MIGRATION_NAME = 'test_transfer_audit_hardening';

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
    `SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [db, tableName, columnName]
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

const CREATE_EXPORT_BATCHES_SQL = `
CREATE TABLE IF NOT EXISTS test_export_batches (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  exported_by BIGINT NOT NULL,
  test_id BIGINT NOT NULL,
  course_id BIGINT NOT NULL,
  format VARCHAR(20) NOT NULL DEFAULT 'json',
  file_name VARCHAR(255) NULL,
  question_count INT NOT NULL DEFAULT 0,
  image_count INT NOT NULL DEFAULT 0,
  status VARCHAR(50) NOT NULL DEFAULT 'COMPLETED',
  error_code VARCHAR(100) NULL,
  error_message VARCHAR(1000) NULL,
  processing_time_ms INT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_test_export_batches_user (exported_by),
  KEY idx_test_export_batches_test (test_id),
  KEY idx_test_export_batches_course (course_id),
  KEY idx_test_export_batches_status (status),
  KEY idx_test_export_batches_created (created_at),
  CONSTRAINT fk_test_export_batches_user FOREIGN KEY (exported_by) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_test_export_batches_test FOREIGN KEY (test_id) REFERENCES tests(id) ON DELETE CASCADE,
  CONSTRAINT fk_test_export_batches_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
  CONSTRAINT chk_test_export_batch_status CHECK (status IN ('COMPLETED', 'FAILED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

const IMPORT_COLUMN_PATCHES = [
  { name: 'format', sql: 'ADD COLUMN format VARCHAR(20) NULL AFTER source_type' },
  { name: 'image_count', sql: 'ADD COLUMN image_count INT NOT NULL DEFAULT 0 AFTER total_questions' },
  {
    name: 'validation_error_count',
    sql: 'ADD COLUMN validation_error_count INT NOT NULL DEFAULT 0 AFTER image_count',
  },
  { name: 'processing_time_ms', sql: 'ADD COLUMN processing_time_ms INT NULL AFTER error_message' },
];

/**
 * @param {import('mysql2/promise').Pool} mysqlPool
 * @param {{ dryRun?: boolean }} [opts]
 */
export async function ensureTestTransferAuditSchema(mysqlPool, { dryRun = false } = {}) {
  await ensureTestImportBatchesSchema(mysqlPool, { dryRun });

  const [dbRows] = await mysqlPool.query('SELECT DATABASE() AS db');
  const db = dbRows[0]?.db;
  if (!db) {
    return { migration: MIGRATION_NAME, skipped: true, reason: 'no_database' };
  }

  const actions = [];

  if (!(await tableExists(mysqlPool, db, 'test_export_batches'))) {
    if (dryRun) {
      actions.push('create_test_export_batches');
    } else {
      await mysqlPool.query(CREATE_EXPORT_BATCHES_SQL);
      actions.push('created_test_export_batches');
      console.log('[schema] Created test_export_batches');
    }
  }

  if (await tableExists(mysqlPool, db, 'test_import_batches')) {
    for (const patch of IMPORT_COLUMN_PATCHES) {
      if (await columnExists(mysqlPool, db, 'test_import_batches', patch.name)) continue;
      if (dryRun) {
        actions.push(`add_test_import_batches.${patch.name}`);
        continue;
      }
      await mysqlPool.query(`ALTER TABLE test_import_batches ${patch.sql}`);
      actions.push(`added_test_import_batches.${patch.name}`);
      console.log(`[schema] Added test_import_batches.${patch.name}`);
    }
  }

  return {
    migration: MIGRATION_NAME,
    applied: actions.length > 0,
    actions,
    dryRun: dryRun || undefined,
  };
}
