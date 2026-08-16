-- Course-scoped discount coupons — admin-managed, one course per code.

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
