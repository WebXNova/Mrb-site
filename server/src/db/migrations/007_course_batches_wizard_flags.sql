-- Course batches: operational feature flags (additive, idempotent).

SET @cb_allow_en = (
  SELECT COUNT(1) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'course_batches' AND COLUMN_NAME = 'allow_enrollment'
);
SET @cb_allow_en_sql = IF(
  @cb_allow_en = 0,
  'ALTER TABLE course_batches ADD COLUMN allow_enrollment TINYINT(1) NOT NULL DEFAULT 1 AFTER is_active',
  'SELECT 1'
);
PREPARE cb_allow_en_stmt FROM @cb_allow_en_sql;
EXECUTE cb_allow_en_stmt;
DEALLOCATE PREPARE cb_allow_en_stmt;

SET @cb_show_pub = (
  SELECT COUNT(1) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'course_batches' AND COLUMN_NAME = 'show_publicly'
);
SET @cb_show_pub_sql = IF(
  @cb_show_pub = 0,
  'ALTER TABLE course_batches ADD COLUMN show_publicly TINYINT(1) NOT NULL DEFAULT 1 AFTER allow_enrollment',
  'SELECT 1'
);
PREPARE cb_show_pub_stmt FROM @cb_show_pub_sql;
EXECUTE cb_show_pub_stmt;
DEALLOCATE PREPARE cb_show_pub_stmt;

SET @cb_cert = (
  SELECT COUNT(1) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'course_batches' AND COLUMN_NAME = 'certificate_enabled'
);
SET @cb_cert_sql = IF(
  @cb_cert = 0,
  'ALTER TABLE course_batches ADD COLUMN certificate_enabled TINYINT(1) NOT NULL DEFAULT 0 AFTER show_publicly',
  'SELECT 1'
);
PREPARE cb_cert_stmt FROM @cb_cert_sql;
EXECUTE cb_cert_stmt;
DEALLOCATE PREPARE cb_cert_stmt;

SET @cb_rec = (
  SELECT COUNT(1) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'course_batches' AND COLUMN_NAME = 'recordings_enabled'
);
SET @cb_rec_sql = IF(
  @cb_rec = 0,
  'ALTER TABLE course_batches ADD COLUMN recordings_enabled TINYINT(1) NOT NULL DEFAULT 1 AFTER certificate_enabled',
  'SELECT 1'
);
PREPARE cb_rec_stmt FROM @cb_rec_sql;
EXECUTE cb_rec_stmt;
DEALLOCATE PREPARE cb_rec_stmt;
