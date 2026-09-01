/**
 * Paid standalone tests: price/capacity on tests, order/payment/registration tables,
 * nullable test_results.course_id (no dummy course).
 */

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

async function indexExists(pool, db, tableName, indexName) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.STATISTICS
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

async function ensureTestResultsCourseIdNullable(pool, db) {
  if (!(await tableExists(pool, db, 'test_results'))) return;
  const [meta] = await pool.query(
    `SELECT IS_NULLABLE AS is_nullable
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'test_results' AND COLUMN_NAME = 'course_id'`,
    [db]
  );
  if (!meta[0]) return;
  if (String(meta[0].is_nullable).toUpperCase() === 'YES') return;
  await pool.query('ALTER TABLE test_results MODIFY COLUMN course_id BIGINT NULL');
  console.log('[schema] test_results.course_id is nullable (paid standalone results)');
}

async function ensureQuestionBankCourseIdNullable(pool, db) {
  if (!(await tableExists(pool, db, 'question_bank'))) return;
  const [meta] = await pool.query(
    `SELECT IS_NULLABLE AS is_nullable
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'question_bank' AND COLUMN_NAME = 'course_id'`,
    [db]
  );
  if (!meta[0]) return;
  if (String(meta[0].is_nullable).toUpperCase() === 'YES') return;
  await pool.query('ALTER TABLE question_bank MODIFY COLUMN course_id BIGINT NULL');
  console.log('[schema] question_bank.course_id is nullable (standalone materialization)');
}

export async function ensurePaidStandaloneSchema(mysqlPool) {
  const [dbRows] = await mysqlPool.query('SELECT DATABASE() AS db');
  const db = dbRows[0]?.db;
  if (!db) return;

  if (await tableExists(mysqlPool, db, 'tests')) {
    await addColumn(mysqlPool, db, 'tests', 'price_pkr', 'price_pkr INT NOT NULL DEFAULT 0 AFTER test_access_type');
    await addColumn(mysqlPool, db, 'tests', 'seat_capacity', 'seat_capacity INT NOT NULL DEFAULT 0 AFTER price_pkr');
  }

  await ensureTestResultsCourseIdNullable(mysqlPool, db);
  await ensureQuestionBankCourseIdNullable(mysqlPool, db);

  if (!(await tableExists(mysqlPool, db, 'standalone_test_registrations'))) {
    await mysqlPool.query(`
CREATE TABLE standalone_test_registrations (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  test_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  applicant_full_name VARCHAR(160) NOT NULL,
  father_name VARCHAR(160) NOT NULL,
  date_of_birth DATE NULL,
  gender VARCHAR(16) NOT NULL,
  whatsapp_number VARCHAR(20) NOT NULL,
  email VARCHAR(191) NOT NULL,
  province_id BIGINT NOT NULL,
  district_id BIGINT NOT NULL,
  city_id BIGINT NOT NULL,
  board_id BIGINT NULL,
  hssc_status VARCHAR(32) NOT NULL,
  mdcat_attempt_type VARCHAR(32) NOT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_standalone_reg_test_user (test_id, user_id),
  KEY idx_standalone_reg_user (user_id),
  CONSTRAINT fk_str_test FOREIGN KEY (test_id) REFERENCES tests(id) ON DELETE CASCADE,
  CONSTRAINT fk_str_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('[schema] Created standalone_test_registrations');
  }

  if (!(await tableExists(mysqlPool, db, 'standalone_test_orders'))) {
    // confirmed_seat_key must be VIRTUAL: InnoDB rejects FKs on base columns of
    // STORED generated columns (same constraint as orders.pending_enrollment_id).
    await mysqlPool.query(`
CREATE TABLE standalone_test_orders (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  test_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  registration_id BIGINT NOT NULL,
  amount INT NOT NULL,
  currency VARCHAR(8) NOT NULL DEFAULT 'PKR',
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  seat_status VARCHAR(32) NOT NULL DEFAULT 'none',
  reference_code VARCHAR(32) NULL,
  confirmed_seat_key VARCHAR(64)
    GENERATED ALWAYS AS (
      IF(status = 'approved' AND seat_status = 'confirmed', CONCAT(test_id, ':', user_id), NULL)
    ) VIRTUAL,
  approved_at DATETIME NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_sto_reference (reference_code),
  UNIQUE KEY uq_sto_confirmed_seat (confirmed_seat_key),
  KEY idx_sto_test_status (test_id, status),
  KEY idx_sto_user (user_id),
  CONSTRAINT fk_sto_test FOREIGN KEY (test_id) REFERENCES tests(id) ON DELETE CASCADE,
  CONSTRAINT fk_sto_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_sto_reg FOREIGN KEY (registration_id) REFERENCES standalone_test_registrations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('[schema] Created standalone_test_orders');
  }

  if (!(await tableExists(mysqlPool, db, 'standalone_test_payments'))) {
    await mysqlPool.query(`
CREATE TABLE standalone_test_payments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  order_id BIGINT NOT NULL,
  student_id BIGINT NOT NULL,
  payment_method ENUM('jazzcash', 'easypaisa') NOT NULL,
  sender_phone_number VARCHAR(20) NOT NULL,
  sender_account_title VARCHAR(120) NOT NULL,
  transaction_id VARCHAR(64) NOT NULL,
  amount_claimed INT NOT NULL,
  screenshot_url VARCHAR(500) NOT NULL,
  screenshot_file_hash CHAR(64) NULL,
  payment_account_id BIGINT UNSIGNED NULL,
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
  UNIQUE KEY uq_stp_approved_transaction_id (approved_transaction_id),
  KEY idx_stp_order_id (order_id),
  KEY idx_stp_status (status),
  KEY idx_stp_transaction_id (transaction_id),
  KEY idx_stp_screenshot_hash (screenshot_file_hash),
  KEY idx_stp_student_created (student_id, created_at),
  CONSTRAINT fk_stp_order FOREIGN KEY (order_id) REFERENCES standalone_test_orders(id),
  CONSTRAINT fk_stp_student FOREIGN KEY (student_id) REFERENCES users(id),
  CONSTRAINT fk_stp_reviewed_by FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('[schema] Created standalone_test_payments');
  } else if (!(await indexExists(mysqlPool, db, 'standalone_test_payments', 'uq_stp_approved_transaction_id'))) {
    await mysqlPool.query(
      'ALTER TABLE standalone_test_payments ADD UNIQUE KEY uq_stp_approved_transaction_id (approved_transaction_id)'
    );
  }
}
