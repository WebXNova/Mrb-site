CREATE TABLE IF NOT EXISTS users (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  email VARCHAR(255) NOT NULL UNIQUE,
  username VARCHAR(50) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(120) NOT NULL,
  token_version INT NOT NULL DEFAULT 0,
  role ENUM('student', 'teacher', 'admin', 'super_admin') NOT NULL DEFAULT 'student',
  status ENUM('active', 'suspended') NOT NULL DEFAULT 'active',
  mrb_enrollment_verified_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
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

CREATE TABLE IF NOT EXISTS mrb_codes (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(40) NOT NULL UNIQUE,
  batch_label VARCHAR(80) NULL,
  is_used BOOLEAN DEFAULT FALSE,
  used_by BIGINT NULL,
  used_at TIMESTAMP NULL,
  expires_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id BIGINT NOT NULL,
  role_snapshot VARCHAR(32) NOT NULL,
  jti VARCHAR(64) NOT NULL,
  refresh_token_hash CHAR(64) NOT NULL,
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
  shuffle_questions BOOLEAN DEFAULT FALSE,
  shuffle_options BOOLEAN DEFAULT FALSE,
  show_explanations BOOLEAN DEFAULT TRUE,
  status ENUM('draft', 'published', 'archived') DEFAULT 'draft',
  public_slug VARCHAR(180) NULL UNIQUE,
  mrb_code_hash VARCHAR(255) NULL,
  mrb_code_expires_at TIMESTAMP NULL,
  mrb_code_max_uses INT NULL,
  mrb_code_used_count INT NOT NULL DEFAULT 0,
  created_by BIGINT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

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

SET @users_mrb_enrollment_exists = (
  SELECT COUNT(1)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'users'
    AND COLUMN_NAME = 'mrb_enrollment_verified_at'
);
SET @users_mrb_enrollment_sql = IF(
  @users_mrb_enrollment_exists = 0,
  'ALTER TABLE users ADD COLUMN mrb_enrollment_verified_at TIMESTAMP NULL DEFAULT NULL',
  'SELECT 1'
);
PREPARE users_mrb_enrollment_stmt FROM @users_mrb_enrollment_sql;
EXECUTE users_mrb_enrollment_stmt;
DEALLOCATE PREPARE users_mrb_enrollment_stmt;

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
