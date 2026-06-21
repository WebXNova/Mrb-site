-- Audit trail for rich-content test import operations.

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
