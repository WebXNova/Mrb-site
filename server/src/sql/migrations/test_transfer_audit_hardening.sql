-- Production audit hardening for test export/import transfer system.

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Extend import batches (apply via ensureTestTransferAuditSchema.js — column-existence checks).
