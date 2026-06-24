import { randomUUID } from 'crypto';

const MIGRATION_NAME = 'export_logs';

async function tableExists(pool, db, tableName) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [db, tableName]
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

const CREATE_EXPORT_LOGS_SQL = `
CREATE TABLE IF NOT EXISTS export_logs (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  export_id CHAR(36) NOT NULL,
  user_id BIGINT NOT NULL,
  test_id BIGINT NOT NULL,
  format VARCHAR(10) NOT NULL DEFAULT 'xlsx',
  total_rows_exported INT NOT NULL DEFAULT 0,
  started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP NULL,
  status ENUM('started', 'completed', 'failed') NOT NULL DEFAULT 'started',
  error_message TEXT NULL,
  KEY idx_export_logs_user (user_id),
  KEY idx_export_logs_test (test_id),
  KEY idx_export_logs_status (status),
  KEY idx_export_logs_created (started_at),
  CONSTRAINT fk_export_logs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_export_logs_test FOREIGN KEY (test_id) REFERENCES tests(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

export async function ensureExportLogsSchema(mysqlPool, { dryRun = false } = {}) {
  const [dbRows] = await mysqlPool.query('SELECT DATABASE() AS db');
  const db = dbRows[0]?.db;
  if (!db) {
    return { migration: MIGRATION_NAME, skipped: true, reason: 'no_database' };
  }

  const actions = [];

  if (!(await tableExists(mysqlPool, db, 'export_logs'))) {
    if (dryRun) {
      actions.push('create_export_logs');
    } else {
      await mysqlPool.query(CREATE_EXPORT_LOGS_SQL);
      actions.push('created_export_logs');
      console.log('[schema] Created export_logs');
    }
  }

  return {
    migration: MIGRATION_NAME,
    applied: actions.length > 0,
    actions,
    dryRun: dryRun || undefined,
  };
}

export async function insertExportLog(mysqlPool, logEntry) {
  const [result] = await mysqlPool.query(
    `INSERT INTO export_logs
     (export_id, user_id, test_id, format, total_rows_exported, started_at, completed_at, status, error_message)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      logEntry.export_id,
      logEntry.user_id,
      logEntry.test_id,
      logEntry.format,
      logEntry.total_rows_exported ?? 0,
      logEntry.started_at,
      logEntry.completed_at ?? null,
      logEntry.status,
      logEntry.error_message ?? null,
    ]
  );
  return result.insertId;
}

export async function updateExportLogStatus(mysqlPool, exportId, update) {
  const sets = [];
  const vals = [];
  if (update.status !== undefined) { sets.push('status = ?'); vals.push(update.status); }
  if (update.completed_at !== undefined) { sets.push('completed_at = ?'); vals.push(update.completed_at); }
  if (update.error_message !== undefined) { sets.push('error_message = ?'); vals.push(update.error_message); }
  if (update.total_rows_exported !== undefined) { sets.push('total_rows_exported = ?'); vals.push(update.total_rows_exported); }
  if (sets.length === 0) return;
  vals.push(exportId);
  await mysqlPool.query(
    `UPDATE export_logs SET ${sets.join(', ')} WHERE export_id = ?`,
    vals
  );
}

export function generateExportId() {
  return randomUUID();
}
