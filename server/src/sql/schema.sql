CREATE TABLE IF NOT EXISTS users (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  email VARCHAR(255) NOT NULL UNIQUE,
  username VARCHAR(50) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(120) NOT NULL,
  is_verified BOOLEAN NOT NULL DEFAULT FALSE,
  last_verification_sent_at TIMESTAMP NULL DEFAULT NULL,
  verification_send_failures INT NOT NULL DEFAULT 0,
  token_version INT NOT NULL DEFAULT 0,
  role ENUM('student', 'teacher', 'admin', 'super_admin') NOT NULL DEFAULT 'student',
  status ENUM('active', 'suspended') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS email_verifications (
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
  CONSTRAINT fk_email_verifications_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  KEY idx_email_verifications_token_hash (token_hash),
  KEY idx_email_verifications_verify_lookup (token_hash, used_at, expires_at),
  KEY idx_email_verifications_user_id (user_id),
  KEY idx_email_verifications_expires_at (expires_at)
);

CREATE TABLE IF NOT EXISTS courses (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  slug VARCHAR(180) NOT NULL UNIQUE,
  title VARCHAR(180) NOT NULL,
  subject VARCHAR(80) NOT NULL,
  description TEXT NOT NULL,
  price INT NOT NULL,
  original_price INT NULL,
  accent_color VARCHAR(20) NULL,
  level VARCHAR(60) NULL,
  instructor VARCHAR(120) NULL,
  lectures_count VARCHAR(20) DEFAULT '0',
  tests_count VARCHAR(20) DEFAULT '0',
  duration_weeks INT DEFAULT 0,
  rating DECIMAL(3,2) DEFAULT 0,
  students_enrolled INT DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_by BIGINT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS lectures (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  course_id BIGINT NOT NULL,
  title VARCHAR(220) NOT NULL,
  youtube_url VARCHAR(500) NOT NULL,
  youtube_video_id VARCHAR(50) NOT NULL,
  topic VARCHAR(120) NULL,
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_lectures_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id BIGINT NOT NULL,
  role_snapshot VARCHAR(32) NOT NULL,
  jti VARCHAR(64) NOT NULL,
  refresh_token_hash CHAR(64) NOT NULL,
  previous_refresh_hash CHAR(64) NULL,
  token_version_snapshot INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  revoked_at TIMESTAMP NULL,
  CONSTRAINT fk_auth_session_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uq_auth_sessions_jti (jti),
  KEY idx_auth_sessions_user_id (user_id),
  KEY idx_auth_sessions_expires_at (expires_at),
  KEY idx_auth_sessions_revoked_at (revoked_at)
);

CREATE TABLE IF NOT EXISTS tests (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  title VARCHAR(220) NOT NULL,
  description TEXT NULL,
  subject VARCHAR(80) NOT NULL,
  category VARCHAR(80) NULL,
  sub_category VARCHAR(80) NULL,
  duration_minutes INT NOT NULL,
  passing_marks INT NULL,
  max_attempts INT DEFAULT 1,
  negative_marking DECIMAL(6,2) NOT NULL DEFAULT 0,
  shuffle_questions BOOLEAN DEFAULT FALSE,
  shuffle_options BOOLEAN DEFAULT FALSE,
  show_explanations BOOLEAN DEFAULT TRUE,
  access_mode ENUM('private', 'public') NOT NULL DEFAULT 'private',
  tags_json JSON NULL,
  status ENUM('draft', 'published', 'archived') DEFAULT 'draft',
  public_slug VARCHAR(180) NULL UNIQUE,
  created_by BIGINT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

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

CREATE TABLE IF NOT EXISTS test_questions (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  test_id BIGINT NOT NULL,
  question_text TEXT NOT NULL,
  question_image_url VARCHAR(1000) NULL,
  options_json JSON NOT NULL,
  correct_option VARCHAR(10) NOT NULL,
  explanation TEXT NOT NULL,
  explanation_image_url VARCHAR(1000) NULL,
  marks INT DEFAULT 1,
  order_index INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_test_questions_test FOREIGN KEY (test_id) REFERENCES tests(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS test_attempts (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  test_id BIGINT NOT NULL,
  user_id BIGINT NULL,
  student_name VARCHAR(120) NULL,
  access_code_label VARCHAR(50) NULL,
  used_code_hash VARCHAR(255) NULL,
  status ENUM('in_progress', 'submitted', 'expired') DEFAULT 'in_progress',
  started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  submitted_at DATETIME NULL,
  last_activity_at DATETIME NULL,
  ip_address VARCHAR(64) NULL,
  user_agent VARCHAR(300) NULL,
  device_fingerprint VARCHAR(128) NULL,
  attempt_nonce VARCHAR(120) NOT NULL,
  result_id BIGINT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_attempt_test FOREIGN KEY (test_id) REFERENCES tests(id) ON DELETE CASCADE,
  CONSTRAINT fk_attempt_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS test_attempt_answers (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  attempt_id BIGINT NOT NULL,
  question_id BIGINT NOT NULL,
  selected_option VARCHAR(10) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_attempt_question (attempt_id, question_id),
  CONSTRAINT fk_attempt_answer_attempt FOREIGN KEY (attempt_id) REFERENCES test_attempts(id) ON DELETE CASCADE,
  CONSTRAINT fk_attempt_answer_question FOREIGN KEY (question_id) REFERENCES test_questions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS test_results (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  attempt_id BIGINT NOT NULL UNIQUE,
  score INT NOT NULL,
  max_score INT NOT NULL,
  percentage DECIMAL(5,2) NOT NULL,
  correct_count INT NOT NULL DEFAULT 0,
  wrong_count INT NOT NULL DEFAULT 0,
  skipped_count INT NOT NULL DEFAULT 0,
  time_taken_seconds INT NOT NULL DEFAULT 0,
  detail_json JSON NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_result_attempt FOREIGN KEY (attempt_id) REFERENCES test_attempts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS activity_logs (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NULL,
  role ENUM('admin', 'student', 'teacher', 'system') NOT NULL DEFAULT 'system',
  action VARCHAR(255) NOT NULL,
  entity_type VARCHAR(255) NOT NULL,
  entity_id VARCHAR(255) NULL,
  metadata_json JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_activity_logs_created_at (created_at),
  INDEX idx_activity_logs_action_created_at (action, created_at)
);

CREATE TABLE IF NOT EXISTS contact_remarks (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(120) NULL,
  email VARCHAR(255) NULL,
  message TEXT NOT NULL,
  page_url VARCHAR(255) NULL,
  status ENUM('new', 'read') NOT NULL DEFAULT 'new',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_contact_remarks_status_created (status, created_at DESC),
  KEY idx_contact_remarks_created (created_at DESC)
);

CREATE TABLE IF NOT EXISTS student_questions (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  subject VARCHAR(32) NOT NULL,
  title VARCHAR(220) NOT NULL,
  body TEXT NOT NULL,
  attachment_url VARCHAR(1000) NULL,
  answer TEXT NULL,
  status ENUM('pending', 'answered') NOT NULL DEFAULT 'pending',
  answered_by BIGINT NULL,
  answered_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_student_questions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_student_questions_answered_by FOREIGN KEY (answered_by) REFERENCES users(id) ON DELETE SET NULL,
  KEY idx_student_questions_user_created (user_id, created_at DESC),
  KEY idx_student_questions_status_subject (status, subject),
  KEY idx_student_questions_updated (updated_at DESC)
);

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

CREATE TABLE IF NOT EXISTS email_suppressions (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  email VARCHAR(255) NOT NULL,
  reason VARCHAR(255) NOT NULL,
  source VARCHAR(120) NOT NULL DEFAULT 'system',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_email_suppressions_email (email),
  KEY idx_email_suppressions_active (active)
);

CREATE TABLE IF NOT EXISTS email_outbox (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NULL,
  template VARCHAR(120) NOT NULL,
  recipient_email VARCHAR(255) NOT NULL,
  payload_json JSON NULL,
  status ENUM('queued', 'processing', 'sent', 'failed', 'dlq') NOT NULL DEFAULT 'queued',
  attempts INT NOT NULL DEFAULT 0,
  last_error VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_email_outbox_status_created (status, created_at),
  KEY idx_email_outbox_user (user_id)
);

CREATE TABLE IF NOT EXISTS email_delivery_dlq (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  outbox_id BIGINT NULL,
  recipient_email VARCHAR(255) NOT NULL,
  reason VARCHAR(255) NOT NULL,
  payload_json JSON NULL,
  failed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_email_delivery_dlq_failed_at (failed_at)
);

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

CREATE TABLE IF NOT EXISTS enrollments (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  email VARCHAR(255) NOT NULL,
  applicant_full_name VARCHAR(160) NOT NULL,
  father_name VARCHAR(160) NOT NULL,
  date_of_birth DATE NULL,
  gender ENUM('male', 'female') NOT NULL,
  whatsapp_number VARCHAR(20) NOT NULL,
  province VARCHAR(80) NOT NULL,
  district VARCHAR(120) NOT NULL,
  hssc_status ENUM('Inter Class', 'First Year Class', 'Matric Class') NOT NULL,
  board VARCHAR(120) NOT NULL,
  mdcat_attempt_type ENUM('Fresher', 'Improver') NOT NULL,
  transaction_id VARCHAR(120) NOT NULL,
  verification_token VARCHAR(64) NULL,
  payment_method VARCHAR(80) NOT NULL DEFAULT 'EasyPaisa and JazzCash',
  account_title VARCHAR(120) NOT NULL DEFAULT 'Muzamil Raheem',
  receipt_url VARCHAR(1000) NOT NULL,
  receipt_original_name VARCHAR(255) NULL,
  receipt_mime_type VARCHAR(80) NULL,
  receipt_size_bytes BIGINT NULL,
  status ENUM('pending', 'verified', 'rejected') NOT NULL DEFAULT 'pending',
  admin_note VARCHAR(500) NULL,
  reviewed_by BIGINT NULL,
  reviewed_at TIMESTAMP NULL,
  submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_enrollments_reviewed_by FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL,
  KEY idx_enrollments_status_submitted (status, submitted_at DESC),
  KEY idx_enrollments_province (province),
  KEY idx_enrollments_board (board),
  KEY idx_enrollments_attempt (mdcat_attempt_type),
  KEY idx_enrollments_email (email),
  KEY idx_enrollments_whatsapp (whatsapp_number),
  UNIQUE KEY uq_enrollments_verification_token (verification_token)
);

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
