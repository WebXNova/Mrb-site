-- Manual JazzCash / EasyPaisa payment proofs + order reference codes.

ALTER TABLE orders
  ADD COLUMN reference_code VARCHAR(32) NULL AFTER currency;

ALTER TABLE orders
  ADD UNIQUE KEY uq_orders_reference_code (reference_code);

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
