-- Configurable cross-course enrollment field mappings (idempotent via ensureCourseFieldMappingsSchema.js)
CREATE TABLE IF NOT EXISTS course_field_mappings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  source_course_id BIGINT NULL,
  target_course_id BIGINT NULL,
  source_field VARCHAR(80) NOT NULL,
  target_field VARCHAR(80) NOT NULL,
  value_map_json JSON NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_course_field_mapping (source_course_id, target_course_id, source_field, target_field),
  KEY idx_course_field_mappings_target (target_course_id, is_active),
  CONSTRAINT fk_cfm_source_course FOREIGN KEY (source_course_id) REFERENCES courses(id) ON DELETE CASCADE,
  CONSTRAINT fk_cfm_target_course FOREIGN KEY (target_course_id) REFERENCES courses(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
