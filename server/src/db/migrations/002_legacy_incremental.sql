-- One-time historical incremental DDL (formerly embedded in schema.sql).
-- Idempotent via INFORMATION_SCHEMA and guarded PREPARE / EXECUTE blocks.
-- Applied once per environment; recorded in schema_migrations.

SET @courses_batch_number_col_exists = (
  SELECT COUNT(1)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'courses'
    AND COLUMN_NAME = 'batch_number'
);
SET @courses_batch_number_col_sql = IF(
  @courses_batch_number_col_exists = 0,
  'ALTER TABLE courses ADD COLUMN batch_number VARCHAR(80) NULL AFTER instructor',
  'SELECT 1'
);
PREPARE courses_batch_number_col_stmt FROM @courses_batch_number_col_sql;
EXECUTE courses_batch_number_col_stmt;
DEALLOCATE PREPARE courses_batch_number_col_stmt;
SET @courses_image_url_col_exists = (
  SELECT COUNT(1)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'courses'
    AND COLUMN_NAME = 'image_url'
);
SET @courses_image_url_col_sql = IF(
  @courses_image_url_col_exists = 0,
  'ALTER TABLE courses ADD COLUMN image_url VARCHAR(1000) NULL AFTER batch_number',
  'SELECT 1'
);
PREPARE courses_image_url_col_stmt FROM @courses_image_url_col_sql;
EXECUTE courses_image_url_col_stmt;
DEALLOCATE PREPARE courses_image_url_col_stmt;
SET @tests_negative_marking_exists = (
  SELECT COUNT(1)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'tests'
    AND COLUMN_NAME = 'negative_marking'
);
SET @tests_negative_marking_sql = IF(
  @tests_negative_marking_exists = 0,
  'ALTER TABLE tests ADD COLUMN negative_marking DECIMAL(6,2) NOT NULL DEFAULT 0 AFTER max_attempts',
  'SELECT 1'
);
PREPARE tests_negative_marking_stmt FROM @tests_negative_marking_sql;
EXECUTE tests_negative_marking_stmt;
DEALLOCATE PREPARE tests_negative_marking_stmt;
SET @tests_access_mode_exists = (
  SELECT COUNT(1)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'tests'
    AND COLUMN_NAME = 'access_mode'
);
SET @tests_access_mode_sql = IF(
  @tests_access_mode_exists = 0,
  "ALTER TABLE tests ADD COLUMN access_mode ENUM('private', 'public') NOT NULL DEFAULT 'private' AFTER show_explanations",
  'SELECT 1'
);
PREPARE tests_access_mode_stmt FROM @tests_access_mode_sql;
EXECUTE tests_access_mode_stmt;
DEALLOCATE PREPARE tests_access_mode_stmt;
SET @tests_tags_json_exists = (
  SELECT COUNT(1)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'tests'
    AND COLUMN_NAME = 'tags_json'
);
SET @tests_tags_json_sql = IF(
  @tests_tags_json_exists = 0,
  'ALTER TABLE tests ADD COLUMN tags_json JSON NULL AFTER access_mode',
  'SELECT 1'
);
PREPARE tests_tags_json_stmt FROM @tests_tags_json_sql;
EXECUTE tests_tags_json_stmt;
DEALLOCATE PREPARE tests_tags_json_stmt;
SET @sq_attach_url_exists = (
  SELECT COUNT(1)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'student_questions'
    AND COLUMN_NAME = 'attachment_url'
);
SET @sq_attach_url_sql = IF(
  @sq_attach_url_exists = 0,
  'ALTER TABLE student_questions ADD COLUMN attachment_url VARCHAR(1000) NULL',
  'SELECT 1'
);
PREPARE sq_attach_url_stmt FROM @sq_attach_url_sql;
EXECUTE sq_attach_url_stmt;
DEALLOCATE PREPARE sq_attach_url_stmt;
SET @users_username_col_exists = (
  SELECT COUNT(1)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'users'
    AND COLUMN_NAME = 'username'
);
SET @users_username_col_sql = IF(
  @users_username_col_exists = 0,
  'ALTER TABLE users ADD COLUMN username VARCHAR(50) NULL',
  'SELECT 1'
);
PREPARE users_username_col_stmt FROM @users_username_col_sql;
EXECUTE users_username_col_stmt;
DEALLOCATE PREPARE users_username_col_stmt;
SET @users_token_version_col_exists = (
  SELECT COUNT(1)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'users'
    AND COLUMN_NAME = 'token_version'
);
SET @users_token_version_col_sql = IF(
  @users_token_version_col_exists = 0,
  'ALTER TABLE users ADD COLUMN token_version INT NOT NULL DEFAULT 0',
  'SELECT 1'
);
PREPARE users_token_version_col_stmt FROM @users_token_version_col_sql;
EXECUTE users_token_version_col_stmt;
DEALLOCATE PREPARE users_token_version_col_stmt;
SET @users_is_verified_col_exists = (
  SELECT COUNT(1)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'users'
    AND COLUMN_NAME = 'is_verified'
);
SET @users_is_verified_col_sql = IF(
  @users_is_verified_col_exists = 0,
  'ALTER TABLE users ADD COLUMN is_verified BOOLEAN NOT NULL DEFAULT FALSE AFTER full_name',
  'SELECT 1'
);
PREPARE users_is_verified_col_stmt FROM @users_is_verified_col_sql;
EXECUTE users_is_verified_col_stmt;
DEALLOCATE PREPARE users_is_verified_col_stmt;
SET @users_last_verification_sent_at_col_exists = (
  SELECT COUNT(1)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'users'
    AND COLUMN_NAME = 'last_verification_sent_at'
);
SET @users_last_verification_sent_at_col_sql = IF(
  @users_last_verification_sent_at_col_exists = 0,
  'ALTER TABLE users ADD COLUMN last_verification_sent_at TIMESTAMP NULL DEFAULT NULL AFTER is_verified',
  'SELECT 1'
);
PREPARE users_last_verification_sent_at_col_stmt FROM @users_last_verification_sent_at_col_sql;
EXECUTE users_last_verification_sent_at_col_stmt;
DEALLOCATE PREPARE users_last_verification_sent_at_col_stmt;
SET @users_verification_send_failures_col_exists = (
  SELECT COUNT(1)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'users'
    AND COLUMN_NAME = 'verification_send_failures'
);
SET @users_verification_send_failures_col_sql = IF(
  @users_verification_send_failures_col_exists = 0,
  'ALTER TABLE users ADD COLUMN verification_send_failures INT NOT NULL DEFAULT 0 AFTER last_verification_sent_at',
  'SELECT 1'
);
PREPARE users_verification_send_failures_col_stmt FROM @users_verification_send_failures_col_sql;
EXECUTE users_verification_send_failures_col_stmt;
DEALLOCATE PREPARE users_verification_send_failures_col_stmt;
SET @email_verifications_table_exists = (
  SELECT COUNT(1)
  FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'email_verifications'
);
SET @email_verifications_table_sql = IF(
  @email_verifications_table_exists = 0,
  'CREATE TABLE email_verifications (
     id BIGINT PRIMARY KEY AUTO_INCREMENT,
     user_id BIGINT NOT NULL,
     token_hash CHAR(64) NOT NULL,
     expires_at DATETIME NOT NULL,
     used_at TIMESTAMP NULL DEFAULT NULL,
     issued_ip VARCHAR(64) NULL,
     issued_user_agent VARCHAR(300) NULL,
     verified_ip VARCHAR(64) NULL,
     verified_user_agent VARCHAR(300) NULL,
     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
     CONSTRAINT fk_email_verifications_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
   )',
  'SELECT 1'
);
PREPARE email_verifications_table_stmt FROM @email_verifications_table_sql;
EXECUTE email_verifications_table_stmt;
DEALLOCATE PREPARE email_verifications_table_stmt;
SET @email_verifications_issued_ip_col_exists = (
  SELECT COUNT(1)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'email_verifications'
    AND COLUMN_NAME = 'issued_ip'
);
SET @email_verifications_issued_ip_col_sql = IF(
  @email_verifications_issued_ip_col_exists = 0,
  'ALTER TABLE email_verifications ADD COLUMN issued_ip VARCHAR(64) NULL AFTER used_at',
  'SELECT 1'
);
PREPARE email_verifications_issued_ip_col_stmt FROM @email_verifications_issued_ip_col_sql;
EXECUTE email_verifications_issued_ip_col_stmt;
DEALLOCATE PREPARE email_verifications_issued_ip_col_stmt;
SET @email_verifications_issued_ua_col_exists = (
  SELECT COUNT(1)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'email_verifications'
    AND COLUMN_NAME = 'issued_user_agent'
);
SET @email_verifications_issued_ua_col_sql = IF(
  @email_verifications_issued_ua_col_exists = 0,
  'ALTER TABLE email_verifications ADD COLUMN issued_user_agent VARCHAR(300) NULL AFTER issued_ip',
  'SELECT 1'
);
PREPARE email_verifications_issued_ua_col_stmt FROM @email_verifications_issued_ua_col_sql;
EXECUTE email_verifications_issued_ua_col_stmt;
DEALLOCATE PREPARE email_verifications_issued_ua_col_stmt;
SET @email_verifications_verified_ip_col_exists = (
  SELECT COUNT(1)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'email_verifications'
    AND COLUMN_NAME = 'verified_ip'
);
SET @email_verifications_verified_ip_col_sql = IF(
  @email_verifications_verified_ip_col_exists = 0,
  'ALTER TABLE email_verifications ADD COLUMN verified_ip VARCHAR(64) NULL AFTER issued_user_agent',
  'SELECT 1'
);
PREPARE email_verifications_verified_ip_col_stmt FROM @email_verifications_verified_ip_col_sql;
EXECUTE email_verifications_verified_ip_col_stmt;
DEALLOCATE PREPARE email_verifications_verified_ip_col_stmt;
SET @email_verifications_verified_ua_col_exists = (
  SELECT COUNT(1)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'email_verifications'
    AND COLUMN_NAME = 'verified_user_agent'
);
SET @email_verifications_verified_ua_col_sql = IF(
  @email_verifications_verified_ua_col_exists = 0,
  'ALTER TABLE email_verifications ADD COLUMN verified_user_agent VARCHAR(300) NULL AFTER verified_ip',
  'SELECT 1'
);
PREPARE email_verifications_verified_ua_col_stmt FROM @email_verifications_verified_ua_col_sql;
EXECUTE email_verifications_verified_ua_col_stmt;
DEALLOCATE PREPARE email_verifications_verified_ua_col_stmt;
SET @email_verifications_token_hash_idx_exists = (
  SELECT COUNT(1)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'email_verifications'
    AND INDEX_NAME = 'idx_email_verifications_token_hash'
);
SET @email_verifications_token_hash_idx_sql = IF(
  @email_verifications_token_hash_idx_exists = 0,
  'CREATE INDEX idx_email_verifications_token_hash ON email_verifications(token_hash)',
  'SELECT 1'
);
PREPARE email_verifications_token_hash_idx_stmt FROM @email_verifications_token_hash_idx_sql;
EXECUTE email_verifications_token_hash_idx_stmt;
DEALLOCATE PREPARE email_verifications_token_hash_idx_stmt;
SET @email_verifications_verify_lookup_idx_exists = (
  SELECT COUNT(1)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'email_verifications'
    AND INDEX_NAME = 'idx_email_verifications_verify_lookup'
);
SET @email_verifications_verify_lookup_idx_sql = IF(
  @email_verifications_verify_lookup_idx_exists = 0,
  'CREATE INDEX idx_email_verifications_verify_lookup ON email_verifications(token_hash, used_at, expires_at)',
  'SELECT 1'
);
PREPARE email_verifications_verify_lookup_idx_stmt FROM @email_verifications_verify_lookup_idx_sql;
EXECUTE email_verifications_verify_lookup_idx_stmt;
DEALLOCATE PREPARE email_verifications_verify_lookup_idx_stmt;
SET @email_verifications_user_id_idx_exists = (
  SELECT COUNT(1)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'email_verifications'
    AND INDEX_NAME = 'idx_email_verifications_user_id'
);
SET @email_verifications_user_id_idx_sql = IF(
  @email_verifications_user_id_idx_exists = 0,
  'CREATE INDEX idx_email_verifications_user_id ON email_verifications(user_id)',
  'SELECT 1'
);
PREPARE email_verifications_user_id_idx_stmt FROM @email_verifications_user_id_idx_sql;
EXECUTE email_verifications_user_id_idx_stmt;
DEALLOCATE PREPARE email_verifications_user_id_idx_stmt;
SET @email_verifications_expires_at_idx_exists = (
  SELECT COUNT(1)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'email_verifications'
    AND INDEX_NAME = 'idx_email_verifications_expires_at'
);
SET @email_verifications_expires_at_idx_sql = IF(
  @email_verifications_expires_at_idx_exists = 0,
  'CREATE INDEX idx_email_verifications_expires_at ON email_verifications(expires_at)',
  'SELECT 1'
);
PREPARE email_verifications_expires_at_idx_stmt FROM @email_verifications_expires_at_idx_sql;
EXECUTE email_verifications_expires_at_idx_stmt;
DEALLOCATE PREPARE email_verifications_expires_at_idx_stmt;
UPDATE users
SET username = LEFT(LOWER(TRIM(SUBSTRING_INDEX(email, '@', 1))), 30)
WHERE username IS NULL OR TRIM(username) = '';
UPDATE users
SET username = CONCAT('user_', id)
WHERE username IS NULL OR TRIM(username) = '' OR LENGTH(TRIM(username)) < 3;
UPDATE users
SET username = CONCAT(LEFT(LOWER(TRIM(username)), 40), '_', id)
WHERE LOWER(TRIM(username)) IN ('admin', 'support', 'root', 'system');
UPDATE users u
JOIN (
  SELECT LOWER(TRIM(username)) AS normalized_username
  FROM users
  WHERE username IS NOT NULL AND TRIM(username) <> ''
  GROUP BY LOWER(TRIM(username))
  HAVING COUNT(*) > 1
) duplicates ON LOWER(TRIM(u.username)) = duplicates.normalized_username
SET u.username = CONCAT(LEFT(LOWER(TRIM(u.username)), 40), '_', u.id);
UPDATE users
SET username = CONCAT('user_', id)
WHERE username IS NULL OR TRIM(username) = '';
ALTER TABLE users
MODIFY COLUMN username VARCHAR(50) NOT NULL;
SET @username_unique_idx_exists = (
  SELECT COUNT(1)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'users'
    AND INDEX_NAME = 'uq_users_username'
);
SET @username_unique_idx_sql = IF(
  @username_unique_idx_exists = 0,
  'ALTER TABLE users ADD CONSTRAINT uq_users_username UNIQUE (username)',
  'SELECT 1'
);
PREPARE username_unique_idx_stmt FROM @username_unique_idx_sql;
EXECUTE username_unique_idx_stmt;
DEALLOCATE PREPARE username_unique_idx_stmt;
SET @users_risk_level_col_exists = (
  SELECT COUNT(1)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'users'
    AND COLUMN_NAME = 'risk_level'
);
SET @users_risk_level_col_sql = IF(
  @users_risk_level_col_exists = 0,
  'ALTER TABLE users ADD COLUMN risk_level ENUM(''normal'', ''elevated'', ''critical'') NOT NULL DEFAULT ''normal''',
  'SELECT 1'
);
PREPARE users_risk_level_col_stmt FROM @users_risk_level_col_sql;
EXECUTE users_risk_level_col_stmt;
DEALLOCATE PREPARE users_risk_level_col_stmt;
SET @auth_sessions_last_ip_hash_col_exists = (
  SELECT COUNT(1)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'auth_sessions'
    AND COLUMN_NAME = 'last_ip_hash'
);
SET @auth_sessions_last_ip_hash_col_sql = IF(
  @auth_sessions_last_ip_hash_col_exists = 0,
  'ALTER TABLE auth_sessions ADD COLUMN last_ip_hash CHAR(64) NULL',
  'SELECT 1'
);
PREPARE auth_sessions_last_ip_hash_col_stmt FROM @auth_sessions_last_ip_hash_col_sql;
EXECUTE auth_sessions_last_ip_hash_col_stmt;
DEALLOCATE PREPARE auth_sessions_last_ip_hash_col_stmt;
SET @auth_sessions_ua_fingerprint_col_exists = (
  SELECT COUNT(1)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'auth_sessions'
    AND COLUMN_NAME = 'ua_fingerprint'
);
SET @auth_sessions_ua_fingerprint_col_sql = IF(
  @auth_sessions_ua_fingerprint_col_exists = 0,
  'ALTER TABLE auth_sessions ADD COLUMN ua_fingerprint CHAR(64) NULL',
  'SELECT 1'
);
PREPARE auth_sessions_ua_fingerprint_col_stmt FROM @auth_sessions_ua_fingerprint_col_sql;
EXECUTE auth_sessions_ua_fingerprint_col_stmt;
DEALLOCATE PREPARE auth_sessions_ua_fingerprint_col_stmt;
SET @auth_sessions_previous_refresh_hash_col_exists = (
  SELECT COUNT(1)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'auth_sessions'
    AND COLUMN_NAME = 'previous_refresh_hash'
);
SET @auth_sessions_previous_refresh_hash_col_sql = IF(
  @auth_sessions_previous_refresh_hash_col_exists = 0,
  'ALTER TABLE auth_sessions ADD COLUMN previous_refresh_hash CHAR(64) NULL AFTER refresh_token_hash',
  'SELECT 1'
);
PREPARE auth_sessions_previous_refresh_hash_col_stmt FROM @auth_sessions_previous_refresh_hash_col_sql;
EXECUTE auth_sessions_previous_refresh_hash_col_stmt;
DEALLOCATE PREPARE auth_sessions_previous_refresh_hash_col_stmt;
SET @auth_sessions_user_revoked_idx_exists = (
  SELECT COUNT(1)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'auth_sessions'
    AND INDEX_NAME = 'idx_auth_sessions_user_revoked'
);
SET @auth_sessions_user_revoked_idx_sql = IF(
  @auth_sessions_user_revoked_idx_exists = 0,
  'CREATE INDEX idx_auth_sessions_user_revoked ON auth_sessions(user_id, revoked_at)',
  'SELECT 1'
);
PREPARE auth_sessions_user_revoked_idx_stmt FROM @auth_sessions_user_revoked_idx_sql;
EXECUTE auth_sessions_user_revoked_idx_stmt;
DEALLOCATE PREPARE auth_sessions_user_revoked_idx_stmt;
SET @users_unverified_created_idx_exists = (
  SELECT COUNT(1)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'users'
    AND INDEX_NAME = 'idx_users_unverified_created_at'
);
SET @users_unverified_created_idx_sql = IF(
  @users_unverified_created_idx_exists = 0,
  'CREATE INDEX idx_users_unverified_created_at ON users(is_verified, created_at)',
  'SELECT 1'
);
PREPARE users_unverified_created_idx_stmt FROM @users_unverified_created_idx_sql;
EXECUTE users_unverified_created_idx_stmt;
DEALLOCATE PREPARE users_unverified_created_idx_stmt;
SET @enrollments_txn_col_exists = (
  SELECT COUNT(1)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'enrollments'
    AND COLUMN_NAME = 'transaction_id'
);
SET @enrollments_txn_col_sql = IF(
  @enrollments_txn_col_exists = 0,
  'ALTER TABLE enrollments ADD COLUMN transaction_id VARCHAR(120) NOT NULL',
  'SELECT 1'
);
PREPARE enrollments_txn_col_stmt FROM @enrollments_txn_col_sql;
EXECUTE enrollments_txn_col_stmt;
DEALLOCATE PREPARE enrollments_txn_col_stmt;
SET @enrollments_status_col_exists = (
  SELECT COUNT(1)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'enrollments'
    AND COLUMN_NAME = 'status'
);
SET @enrollments_status_col_sql = IF(
  @enrollments_status_col_exists = 0,
  "ALTER TABLE enrollments ADD COLUMN status ENUM('pending', 'verified', 'rejected') NOT NULL DEFAULT 'pending'",
  'SELECT 1'
);
PREPARE enrollments_status_col_stmt FROM @enrollments_status_col_sql;
EXECUTE enrollments_status_col_stmt;
DEALLOCATE PREPARE enrollments_status_col_stmt;
SET @enrollments_unique_txn_idx_exists = (
  SELECT COUNT(1)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'enrollments'
    AND INDEX_NAME = 'uq_enrollments_transaction_id'
);
SET @enrollments_unique_txn_idx_sql = IF(
  @enrollments_unique_txn_idx_exists = 0,
  'ALTER TABLE enrollments ADD CONSTRAINT uq_enrollments_transaction_id UNIQUE (transaction_id)',
  'SELECT 1'
);
PREPARE enrollments_unique_txn_idx_stmt FROM @enrollments_unique_txn_idx_sql;
EXECUTE enrollments_unique_txn_idx_stmt;
DEALLOCATE PREPARE enrollments_unique_txn_idx_stmt;
SET @enrollments_verify_token_exists = (
  SELECT COUNT(1)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'enrollments'
    AND COLUMN_NAME = 'verification_token'
);
SET @enrollments_verify_token_sql = IF(
  @enrollments_verify_token_exists = 0,
  'ALTER TABLE enrollments ADD COLUMN verification_token VARCHAR(64) NULL',
  'SELECT 1'
);
PREPARE enrollments_verify_token_stmt FROM @enrollments_verify_token_sql;
EXECUTE enrollments_verify_token_stmt;
DEALLOCATE PREPARE enrollments_verify_token_stmt;
SET @uq_enrollment_verify_idx_exists = (
  SELECT COUNT(1)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'enrollments'
    AND INDEX_NAME = 'uq_enrollments_verification_token'
);
SET @uq_enrollment_verify_idx_sql = IF(
  @uq_enrollment_verify_idx_exists = 0,
  'CREATE UNIQUE INDEX uq_enrollments_verification_token ON enrollments (verification_token)',
  'SELECT 1'
);
PREPARE uq_enrollment_verify_idx_stmt FROM @uq_enrollment_verify_idx_sql;
EXECUTE uq_enrollment_verify_idx_stmt;
DEALLOCATE PREPARE uq_enrollment_verify_idx_stmt;
SET @enrollments_batch_col_exists = (
  SELECT COUNT(1)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'enrollments'
    AND COLUMN_NAME = 'batch_number'
);
SET @enrollments_batch_col_sql = IF(
  @enrollments_batch_col_exists = 0,
  'ALTER TABLE enrollments ADD COLUMN batch_number VARCHAR(20) NULL',
  'SELECT 1'
);
PREPARE enrollments_batch_col_stmt FROM @enrollments_batch_col_sql;
EXECUTE enrollments_batch_col_stmt;
DEALLOCATE PREPARE enrollments_batch_col_stmt;
SET @enrollments_batch_idx_exists = (
  SELECT COUNT(1)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'enrollments'
    AND INDEX_NAME = 'idx_enrollments_batch_submitted'
);
SET @enrollments_batch_idx_sql = IF(
  @enrollments_batch_idx_exists = 0,
  'CREATE INDEX idx_enrollments_batch_submitted ON enrollments (batch_number, submitted_at DESC)',
  'SELECT 1'
);
PREPARE enrollments_batch_idx_stmt FROM @enrollments_batch_idx_sql;
EXECUTE enrollments_batch_idx_stmt;
DEALLOCATE PREPARE enrollments_batch_idx_stmt;
SET @courses_short_desc_exists = (
  SELECT COUNT(1)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'courses'
    AND COLUMN_NAME = 'short_description'
);
SET @courses_short_desc_sql = IF(
  @courses_short_desc_exists = 0,
  'ALTER TABLE courses ADD COLUMN short_description VARCHAR(512) NULL AFTER description',
  'SELECT 1'
);
PREPARE courses_short_desc_stmt FROM @courses_short_desc_sql;
EXECUTE courses_short_desc_stmt;
DEALLOCATE PREPARE courses_short_desc_stmt;
SET @courses_slug_nullable_sql = 'ALTER TABLE courses MODIFY COLUMN slug VARCHAR(180) NULL';
PREPARE courses_slug_nullable_stmt FROM @courses_slug_nullable_sql;
EXECUTE courses_slug_nullable_stmt;
DEALLOCATE PREPARE courses_slug_nullable_stmt;
SET @courses_subject_nullable_sql = 'ALTER TABLE courses MODIFY COLUMN subject VARCHAR(80) NULL';
PREPARE courses_subject_nullable_stmt FROM @courses_subject_nullable_sql;
EXECUTE courses_subject_nullable_stmt;
DEALLOCATE PREPARE courses_subject_nullable_stmt;
SET @courses_price_default_sql = 'ALTER TABLE courses MODIFY COLUMN price INT NOT NULL DEFAULT 0';
PREPARE courses_price_default_stmt FROM @courses_price_default_sql;
EXECUTE courses_price_default_stmt;
DEALLOCATE PREPARE courses_price_default_stmt;
