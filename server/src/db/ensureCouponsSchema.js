/**
 * Idempotent schema ensure — coupons.
 */

const MIGRATION_NAME = 'coupons';

async function tableExists(mysqlPool, db, tableName) {
  const [rows] = await mysqlPool.query(
    `SELECT COUNT(*) AS n
     FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [db, tableName]
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

/**
 * @param {import('mysql2/promise').Pool} mysqlPool
 * @param {{ dryRun?: boolean }} [opts]
 */
export async function ensureCouponsSchema(mysqlPool, { dryRun = false } = {}) {
  const [dbRows] = await mysqlPool.query('SELECT DATABASE() AS db');
  const db = dbRows[0]?.db;
  if (!db) return { migration: MIGRATION_NAME, skipped: true, reason: 'no_database' };

  if (await tableExists(mysqlPool, db, 'coupons')) {
    return { migration: MIGRATION_NAME, skipped: true, reason: 'table_exists' };
  }

  const sql = `
CREATE TABLE IF NOT EXISTS coupons (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(64) NOT NULL,
  course_id BIGINT NOT NULL,
  discount_type ENUM('flat', 'percentage') NOT NULL,
  discount_value DECIMAL(10, 2) NOT NULL,
  usage_limit INT NOT NULL,
  used_count INT NOT NULL DEFAULT 0,
  valid_from DATE NOT NULL,
  valid_until DATE NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by BIGINT NOT NULL,
  updated_by BIGINT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_coupons_course FOREIGN KEY (course_id) REFERENCES courses(id),
  CONSTRAINT fk_coupons_created_by FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT fk_coupons_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE KEY uq_coupons_code (code),
  KEY idx_coupons_course_id (course_id),
  KEY idx_coupons_is_active (is_active),
  KEY idx_coupons_valid_from (valid_from),
  KEY idx_coupons_valid_until (valid_until)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;

  if (dryRun) {
    return { migration: MIGRATION_NAME, dryRun: true, sql };
  }

  for (const statement of sql
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)) {
    await mysqlPool.query(statement);
  }

  return { migration: MIGRATION_NAME, ok: true };
}
