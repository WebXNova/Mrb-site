-- Reference DDL (CREATE IF NOT EXISTS only). No runtime alters here.
-- Apply ordered migrations: npm run db:migrate
-- See server/docs/migrations.md

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
  slug VARCHAR(180) NULL UNIQUE,
  title VARCHAR(180) NOT NULL,
  subject VARCHAR(80) NULL,
  description TEXT NOT NULL,
  short_description VARCHAR(512) NULL,
  price INT NOT NULL DEFAULT 0,
  original_price INT NULL,
  accent_color VARCHAR(20) NULL,
  level VARCHAR(60) NULL,
  instructor VARCHAR(120) NULL,
  batch_number VARCHAR(80) NULL,
  image_url VARCHAR(1000) NULL,
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

CREATE TABLE IF NOT EXISTS subjects (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  course_id BIGINT NOT NULL,
  title VARCHAR(180) NOT NULL,
  description TEXT NULL,
  order_index INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_subjects_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
  KEY idx_subjects_course (course_id),
  KEY idx_subjects_course_order (course_id, order_index),
  KEY idx_subjects_course_active (course_id, is_active)
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
  batch_number VARCHAR(20) NULL,
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
  KEY idx_enrollments_batch_submitted (batch_number, submitted_at DESC),
  UNIQUE KEY uq_enrollments_verification_token (verification_token)
);
