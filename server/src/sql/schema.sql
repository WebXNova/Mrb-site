CREATE TABLE IF NOT EXISTS users (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(120) NOT NULL,
  role ENUM('student', 'teacher', 'admin', 'super_admin') NOT NULL DEFAULT 'student',
  status ENUM('active', 'suspended') NOT NULL DEFAULT 'active',
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

CREATE TABLE IF NOT EXISTS admin_sessions (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  admin_id BIGINT NOT NULL,
  refresh_token_hash VARCHAR(255) NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_admin_session_admin FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE CASCADE
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

ALTER TABLE tests
  ADD COLUMN IF NOT EXISTS public_slug VARCHAR(180) NULL UNIQUE AFTER status;

ALTER TABLE tests
  ADD COLUMN IF NOT EXISTS mrb_code_hash VARCHAR(255) NULL AFTER public_slug;

ALTER TABLE tests
  ADD COLUMN IF NOT EXISTS mrb_code_expires_at TIMESTAMP NULL AFTER mrb_code_hash;

ALTER TABLE tests
  ADD COLUMN IF NOT EXISTS mrb_code_max_uses INT NULL AFTER mrb_code_expires_at;

ALTER TABLE tests
  ADD COLUMN IF NOT EXISTS mrb_code_used_count INT NOT NULL DEFAULT 0 AFTER mrb_code_max_uses;

ALTER TABLE tests
  ADD COLUMN IF NOT EXISTS category VARCHAR(80) NULL AFTER subject;

ALTER TABLE tests
  ADD COLUMN IF NOT EXISTS sub_category VARCHAR(80) NULL AFTER category;

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

ALTER TABLE test_questions
  ADD COLUMN IF NOT EXISTS question_image_url VARCHAR(1000) NULL AFTER question_text;

ALTER TABLE test_questions
  ADD COLUMN IF NOT EXISTS explanation_image_url VARCHAR(1000) NULL AFTER explanation;

CREATE TABLE IF NOT EXISTS test_attempts (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  test_id BIGINT NOT NULL,
  user_id BIGINT NULL,
  student_name VARCHAR(120) NULL,
  access_code_label VARCHAR(50) NULL,
  used_code_hash VARCHAR(255) NULL,
  status ENUM('in_progress', 'submitted', 'expired') DEFAULT 'in_progress',
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  submitted_at TIMESTAMP NULL,
  last_activity_at TIMESTAMP NULL,
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

ALTER TABLE test_attempts
  ADD COLUMN IF NOT EXISTS user_id BIGINT NULL AFTER test_id;

ALTER TABLE test_attempts
  ADD COLUMN IF NOT EXISTS device_fingerprint VARCHAR(128) NULL AFTER user_agent;

ALTER TABLE test_attempts
  ADD COLUMN IF NOT EXISTS attempt_nonce VARCHAR(120) NOT NULL DEFAULT 'seed_nonce' AFTER device_fingerprint;

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
