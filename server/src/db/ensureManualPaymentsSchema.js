/**
 * Idempotent schema ensure — orders.reference_code + manual_payments (incl. risk columns).
 */

const MIGRATION_NAME = 'manual_payments';

async function tableExists(mysqlPool, db, tableName) {
  const [rows] = await mysqlPool.query(
    `SELECT COUNT(*) AS n
     FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [db, tableName]
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

async function columnExists(mysqlPool, db, tableName, columnName) {
  const [rows] = await mysqlPool.query(
    `SELECT COUNT(*) AS n
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [db, tableName, columnName]
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

async function indexExists(mysqlPool, db, tableName, indexName) {
  const [rows] = await mysqlPool.query(
    `SELECT COUNT(*) AS n
     FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [db, tableName, indexName]
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

/**
 * @param {import('mysql2/promise').Pool} mysqlPool
 * @param {{ dryRun?: boolean }} [opts]
 */
export async function ensureManualPaymentsSchema(mysqlPool, { dryRun = false } = {}) {
  const [dbRows] = await mysqlPool.query('SELECT DATABASE() AS db');
  const db = dbRows[0]?.db;
  if (!db) return { migration: MIGRATION_NAME, skipped: true, reason: 'no_database' };

  const statements = [];

  if (await tableExists(mysqlPool, db, 'orders')) {
    if (!(await columnExists(mysqlPool, db, 'orders', 'reference_code'))) {
      statements.push(
        `ALTER TABLE orders ADD COLUMN reference_code VARCHAR(32) NULL AFTER currency`
      );
    }
    if (!(await indexExists(mysqlPool, db, 'orders', 'uq_orders_reference_code'))) {
      statements.push(`ALTER TABLE orders ADD UNIQUE KEY uq_orders_reference_code (reference_code)`);
    }
  }

  if (!(await tableExists(mysqlPool, db, 'manual_payments'))) {
    statements.push(`
CREATE TABLE IF NOT EXISTS manual_payments (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  order_id BIGINT UNSIGNED NOT NULL,
  enrollment_id BIGINT UNSIGNED NOT NULL,
  student_id BIGINT NOT NULL,
  payment_method ENUM('jazzcash', 'easypaisa') NOT NULL,
  sender_phone_number VARCHAR(20) NOT NULL,
  sender_account_title VARCHAR(120) NOT NULL,
  transaction_id VARCHAR(64) NOT NULL,
  amount_claimed INT NOT NULL,
  screenshot_url VARCHAR(500) NOT NULL,
  screenshot_file_hash CHAR(64) NULL,
  payment_account_id BIGINT UNSIGNED NULL,
  coupon_id BIGINT UNSIGNED NULL,
  discount_applied DECIMAL(10, 2) NULL,
  original_amount INT NULL,
  status ENUM('pending_review', 'approved', 'rejected') NOT NULL DEFAULT 'pending_review',
  admin_note TEXT NULL,
  reviewed_by BIGINT NULL,
  reviewed_at TIMESTAMP NULL,
  risk_flags JSON NULL,
  risk_level ENUM('low', 'needs_review') NOT NULL DEFAULT 'low',
  approved_transaction_id VARCHAR(64)
    GENERATED ALWAYS AS (IF(status = 'approved', transaction_id, NULL)) STORED,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_manual_payments_order FOREIGN KEY (order_id) REFERENCES orders(id),
  CONSTRAINT fk_manual_payments_enrollment FOREIGN KEY (enrollment_id) REFERENCES enrollments(id),
  CONSTRAINT fk_manual_payments_student FOREIGN KEY (student_id) REFERENCES users(id),
  CONSTRAINT fk_manual_payments_account FOREIGN KEY (payment_account_id) REFERENCES payment_accounts(id) ON DELETE SET NULL,
  CONSTRAINT fk_manual_payments_reviewed_by FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE KEY uq_manual_payments_approved_transaction_id (approved_transaction_id),
  KEY idx_manual_payments_order_id (order_id),
  KEY idx_manual_payments_status (status),
  KEY idx_manual_payments_transaction_id (transaction_id),
  KEY idx_manual_payments_screenshot_hash (screenshot_file_hash),
  KEY idx_manual_payments_student_created (student_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  } else {
    if (!(await columnExists(mysqlPool, db, 'manual_payments', 'risk_flags'))) {
      statements.push(`ALTER TABLE manual_payments ADD COLUMN risk_flags JSON NULL`);
    }
    if (!(await columnExists(mysqlPool, db, 'manual_payments', 'risk_level'))) {
      statements.push(
        `ALTER TABLE manual_payments ADD COLUMN risk_level ENUM('low', 'needs_review') NOT NULL DEFAULT 'low'`
      );
    }
    if (!(await columnExists(mysqlPool, db, 'manual_payments', 'approved_transaction_id'))) {
      statements.push(`
        ALTER TABLE manual_payments
        ADD COLUMN approved_transaction_id VARCHAR(64)
          GENERATED ALWAYS AS (IF(status = 'approved', transaction_id, NULL)) STORED
      `);
    }
    if (!(await indexExists(mysqlPool, db, 'manual_payments', 'uq_manual_payments_approved_transaction_id'))) {
      statements.push(
        `ALTER TABLE manual_payments ADD UNIQUE KEY uq_manual_payments_approved_transaction_id (approved_transaction_id)`
      );
    }
    if (!(await indexExists(mysqlPool, db, 'manual_payments', 'idx_manual_payments_screenshot_hash'))) {
      statements.push(
        `ALTER TABLE manual_payments ADD KEY idx_manual_payments_screenshot_hash (screenshot_file_hash)`
      );
    }
    if (!(await indexExists(mysqlPool, db, 'manual_payments', 'idx_manual_payments_transaction_id'))) {
      statements.push(
        `ALTER TABLE manual_payments ADD KEY idx_manual_payments_transaction_id (transaction_id)`
      );
    }
    if (!(await columnExists(mysqlPool, db, 'manual_payments', 'coupon_id'))) {
      statements.push(`ALTER TABLE manual_payments ADD COLUMN coupon_id BIGINT UNSIGNED NULL AFTER payment_account_id`);
    }
    if (!(await columnExists(mysqlPool, db, 'manual_payments', 'discount_applied'))) {
      statements.push(
        `ALTER TABLE manual_payments ADD COLUMN discount_applied DECIMAL(10, 2) NULL AFTER coupon_id`
      );
    }
    if (!(await columnExists(mysqlPool, db, 'manual_payments', 'original_amount'))) {
      statements.push(`ALTER TABLE manual_payments ADD COLUMN original_amount INT NULL AFTER discount_applied`);
    }
  }

  if (dryRun) {
    return { migration: MIGRATION_NAME, dryRun: true, statements };
  }

  for (const statement of statements) {
    const sql = statement.trim();
    if (sql) await mysqlPool.query(sql);
  }

  return { migration: MIGRATION_NAME, ok: true, applied: statements.length };
}
