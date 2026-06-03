-- =====================================================
-- FULL SCHEMA (single source of truth)
-- Apply in MySQL Workbench (or mysql client) against an empty database.
-- No incremental migrations; edit this file when the model changes.
-- =====================================================

-- =====================================================
-- USERS & AUTHENTICATION
-- =====================================================

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
  risk_level ENUM('normal', 'elevated', 'critical') NOT NULL DEFAULT 'normal',
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
  last_ip_hash CHAR(64) NULL,
  ua_fingerprint CHAR(64) NULL,
  CONSTRAINT fk_auth_session_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uq_auth_sessions_jti (jti),
  KEY idx_auth_sessions_user_id (user_id),
  KEY idx_auth_sessions_expires_at (expires_at),
  KEY idx_auth_sessions_revoked_at (revoked_at)
);

-- =====================================================
-- COURSES & CONTENT
-- =====================================================

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

CREATE TABLE IF NOT EXISTS chapters (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,

  subject_id BIGINT NOT NULL,

  title VARCHAR(255) NOT NULL,
  description TEXT DEFAULT NULL,

  order_index INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,

  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  KEY idx_subject_id (subject_id),
  KEY idx_subject_order (subject_id, order_index),

  CONSTRAINT fk_chapters_subject
    FOREIGN KEY (subject_id)
    REFERENCES subjects(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS course_pricing (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  course_id BIGINT NOT NULL,
  price_amount INT NOT NULL,
  original_price_amount INT NULL,
  currency_code VARCHAR(10) NOT NULL DEFAULT 'PKR',
  pricing_type ENUM('free', 'one_time', 'subscription') NOT NULL DEFAULT 'one_time',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  enrollment_visible TINYINT(1) NOT NULL DEFAULT 1,
  public_purchase_visible TINYINT(1) NOT NULL DEFAULT 1,
  starts_at TIMESTAMP NULL DEFAULT NULL,
  ends_at TIMESTAMP NULL DEFAULT NULL,
  created_by BIGINT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_course_pricing_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
  CONSTRAINT fk_course_pricing_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  KEY idx_course_pricing_course_active (course_id, is_active),
  KEY idx_course_pricing_course_window (course_id, starts_at, ends_at)
);

CREATE TABLE IF NOT EXISTS course_batches (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  course_id BIGINT NOT NULL,
  title VARCHAR(180) NOT NULL,
  code VARCHAR(120) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  enrollment_open_at DATETIME NOT NULL,
  enrollment_close_at DATETIME NOT NULL,
  total_seats INT NOT NULL,
  seats_filled INT NOT NULL DEFAULT 0,
  instructor_name VARCHAR(160) NULL,
  schedule_label VARCHAR(180) NULL,
  timezone VARCHAR(80) NOT NULL DEFAULT 'UTC',
  status VARCHAR(40) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  allow_enrollment TINYINT(1) NOT NULL DEFAULT 1,
  show_publicly TINYINT(1) NOT NULL DEFAULT 1,
  certificate_enabled TINYINT(1) NOT NULL DEFAULT 0,
  recordings_enabled TINYINT(1) NOT NULL DEFAULT 1,
  created_by BIGINT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_course_batches_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
  CONSTRAINT fk_course_batches_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE KEY uq_course_batch_course_code (course_id, code),
  UNIQUE KEY uq_course_batches_single_course (course_id),
  KEY idx_course_batches_code (code),
  KEY idx_course_batches_course (course_id),
  KEY idx_course_batches_status (status),
  KEY idx_course_batches_active (course_id, is_active),
  KEY idx_course_batches_enrollment_window (enrollment_open_at, enrollment_close_at),
  KEY idx_course_batches_course_status (course_id, status)
);

-- Lectures — Phase 3D Step 1 foundation (COURSE → SUBJECT → CHAPTER → LECTURE)
--
-- LEGACY (unchanged, required at runtime):
--   course_id BIGINT NOT NULL  — current admin/student APIs read/write this only
--
-- FORWARD (additive, nullable until later phases):
--   chapter_id BIGINT UNSIGNED NULL — optional link to chapters.id; NO FK yet
--
-- NOT in MRB canonical schema: lectures.subject_id (ownership is course-scoped today;
-- subject context is derived via chapters after backfill in phase2+).
--
-- Step 1 explicitly does NOT: NOT NULL chapter_id, FK to chapters, DROP/ALTER course_id,
-- backfill rows, or change application code.
CREATE TABLE IF NOT EXISTS lectures (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  course_id BIGINT NOT NULL,
  chapter_id BIGINT UNSIGNED NULL,
  title VARCHAR(220) NOT NULL,
  youtube_url VARCHAR(500) NOT NULL,
  youtube_video_id VARCHAR(50) NOT NULL,
  topic VARCHAR(120) NULL,
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_lectures_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
  KEY idx_lectures_chapter_id (chapter_id)
);

-- =====================================================
-- ASSESSMENT & TEST MANAGEMENT
-- FK types: BIGINT (signed) — matches users.id, courses.id, subjects.id
-- Dependency order: tests → question_bank → question_options,
--   question_import_batches → test_questions → test_attempts →
--   student_answers → test_results
-- =====================================================

CREATE TABLE IF NOT EXISTS tests (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  course_id BIGINT NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  subject VARCHAR(80) NULL,
  category VARCHAR(80) NULL,
  sub_category VARCHAR(80) NULL,
  test_type VARCHAR(50) NOT NULL DEFAULT 'standard',
  duration_minutes INT NOT NULL,
  passing_percentage DECIMAL(5,2) NOT NULL DEFAULT 40.00,
  passing_marks INT NULL,
  max_attempts INT NOT NULL DEFAULT 1,
  negative_marking DECIMAL(5,2) NOT NULL DEFAULT 0,
  shuffle_questions TINYINT(1) NOT NULL DEFAULT 0,
  shuffle_options TINYINT(1) NOT NULL DEFAULT 0,
  show_explanations TINYINT(1) NOT NULL DEFAULT 1,
  show_result_immediately TINYINT(1) NOT NULL DEFAULT 1,
  show_answers_after_submit TINYINT(1) NOT NULL DEFAULT 0,
  allow_retake TINYINT(1) NOT NULL DEFAULT 0,
  access_mode VARCHAR(20) NOT NULL DEFAULT 'private',
  tags_json TEXT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'DRAFT',
  public_slug VARCHAR(120) NULL,
  start_date DATETIME NULL,
  end_date DATETIME NULL,
  created_by BIGINT NOT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  UNIQUE KEY idx_tests_public_slug (public_slug),
  KEY idx_course (course_id),
  KEY idx_status (status),
  KEY idx_dates (start_date, end_date),
  KEY fk_tests_creator (created_by),
  CONSTRAINT fk_tests_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
  CONSTRAINT fk_tests_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS question_bank (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  course_id BIGINT NOT NULL,
  subject_id BIGINT NULL,
  topic VARCHAR(255) NULL,
  difficulty VARCHAR(50) NULL,
  question_type VARCHAR(50) NOT NULL,
  question_text LONGTEXT NOT NULL,
  explanation LONGTEXT NULL,
  marks DECIMAL(8,2) NOT NULL DEFAULT 1.00,
  created_by BIGINT NOT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  deleted_by BIGINT NULL,
  KEY idx_course (course_id),
  KEY idx_subject (subject_id),
  KEY idx_type (question_type),
  KEY idx_difficulty (difficulty),
  KEY idx_qb_deleted_at (deleted_at),
  KEY idx_qb_active_list (deleted_at, course_id, id),
  KEY fk_qb_creator (created_by),
  CONSTRAINT fk_qb_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
  CONSTRAINT fk_qb_subject FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE SET NULL,
  CONSTRAINT fk_qb_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_qb_deleted_by FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT chk_qb_soft_delete_actor CHECK (deleted_at IS NULL OR deleted_by IS NOT NULL)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- question_bank soft-delete hardening (deleted_by + indexes + CHECK):
-- Up:       sql/migrations/question_bank_soft_delete_hardening.sql
-- Rollback: sql/migrations/question_bank_soft_delete_hardening_rollback.sql
-- Node:     src/db/ensureQuestionBankSoftDeleteSchema.js

CREATE TABLE IF NOT EXISTS question_options (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  question_id BIGINT NOT NULL,
  option_text LONGTEXT NOT NULL,
  is_correct TINYINT(1) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_question (question_id),
  CONSTRAINT fk_option_question FOREIGN KEY (question_id) REFERENCES question_bank(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS question_import_batches (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  uploaded_by BIGINT NOT NULL,
  source_type VARCHAR(50) NOT NULL,
  file_name VARCHAR(255) NULL,
  total_questions INT NOT NULL DEFAULT 0,
  successful_questions INT NOT NULL DEFAULT 0,
  failed_questions INT NOT NULL DEFAULT 0,
  status VARCHAR(50) NOT NULL DEFAULT 'COMPLETED',
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_uploaded_by (uploaded_by),
  KEY idx_source (source_type),
  CONSTRAINT fk_import_user FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS test_questions (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  test_id BIGINT NOT NULL,
  question_id BIGINT NOT NULL,
  display_order INT NOT NULL DEFAULT 0,
  marks_override DECIMAL(8,2) NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_test_question (test_id, question_id),
  KEY idx_test (test_id),
  KEY idx_question (question_id),
  CONSTRAINT fk_tq_test FOREIGN KEY (test_id) REFERENCES tests(id) ON DELETE CASCADE,
  CONSTRAINT fk_tq_question FOREIGN KEY (question_id) REFERENCES question_bank(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS test_attempts (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  test_id BIGINT NOT NULL,
  student_id BIGINT NOT NULL,
  user_id BIGINT NULL,
  student_name VARCHAR(255) NULL,
  access_code_label VARCHAR(64) NULL DEFAULT 'DIRECT',
  attempt_number INT NOT NULL,
  status VARCHAR(50) NOT NULL,
  started_at DATETIME NOT NULL,
  expires_at DATETIME NULL,
  last_activity_at DATETIME NULL,
  ip_address VARCHAR(64) NULL,
  user_agent TEXT NULL,
  device_fingerprint VARCHAR(128) NULL,
  used_code_hash VARCHAR(128) NULL,
  attempt_nonce VARCHAR(64) NULL,
  result_id BIGINT NULL,
  submitted_at DATETIME NULL,
  time_taken_seconds INT NULL,
  score DECIMAL(10,2) NULL,
  percentage DECIMAL(5,2) NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_attempt (test_id, student_id, attempt_number),
  KEY idx_test (test_id),
  KEY idx_student (student_id),
  KEY idx_user (user_id),
  KEY idx_status (status),
  CONSTRAINT fk_attempt_test FOREIGN KEY (test_id) REFERENCES tests(id) ON DELETE CASCADE,
  CONSTRAINT fk_attempt_student FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS student_answers (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  attempt_id BIGINT NOT NULL,
  question_id BIGINT NOT NULL,
  selected_option_id BIGINT NULL,
  is_correct TINYINT(1) NULL,
  marks_awarded DECIMAL(8,2) NULL,
  answered_at DATETIME NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_attempt_question (attempt_id, question_id),
  KEY idx_attempt (attempt_id),
  KEY fk_sa_question (question_id),
  KEY fk_sa_option (selected_option_id),
  CONSTRAINT fk_sa_attempt FOREIGN KEY (attempt_id) REFERENCES test_attempts(id) ON DELETE CASCADE,
  CONSTRAINT fk_sa_question FOREIGN KEY (question_id) REFERENCES question_bank(id) ON DELETE CASCADE,
  CONSTRAINT fk_sa_option FOREIGN KEY (selected_option_id) REFERENCES question_options(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS test_results (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  attempt_id BIGINT NOT NULL,
  student_id BIGINT NOT NULL,
  test_id BIGINT NOT NULL,
  course_id BIGINT NOT NULL,
  total_questions INT NOT NULL,
  correct_answers INT NOT NULL DEFAULT 0,
  wrong_answers INT NOT NULL DEFAULT 0,
  skipped_answers INT NOT NULL DEFAULT 0,
  score DECIMAL(10,2) NOT NULL,
  max_score DECIMAL(10,2) NULL,
  correct_count INT NULL,
  wrong_count INT NULL,
  skipped_count INT NULL,
  time_taken_seconds INT NULL,
  detail_json LONGTEXT NULL,
  percentage DECIMAL(5,2) NOT NULL,
  grade VARCHAR(20) NULL,
  rank_position INT NULL,
  generated_at DATETIME NOT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_attempt_result (attempt_id),
  KEY idx_student (student_id),
  KEY idx_test (test_id),
  KEY idx_course (course_id),
  KEY idx_percentage (percentage),
  CONSTRAINT fk_result_attempt FOREIGN KEY (attempt_id) REFERENCES test_attempts(id) ON DELETE CASCADE,
  CONSTRAINT fk_result_student FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_result_test FOREIGN KEY (test_id) REFERENCES tests(id) ON DELETE CASCADE,
  CONSTRAINT fk_result_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- GEOGRAPHIC DATA: PROVINCES
-- =====================================================

CREATE TABLE provinces (
    id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(120) NOT NULL,
    slug VARCHAR(140) NOT NULL,
    is_other_option BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INT NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT uq_provinces_name UNIQUE (name),
    CONSTRAINT uq_provinces_slug UNIQUE (slug)
);

CREATE INDEX idx_provinces_active
    ON provinces(is_active);

CREATE INDEX idx_provinces_sort
    ON provinces(sort_order);

-- =====================================================
-- GEOGRAPHIC DATA: DIVISIONS
-- =====================================================

CREATE TABLE divisions (
    id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    province_id BIGINT UNSIGNED NOT NULL,
    name VARCHAR(120) NOT NULL,
    slug VARCHAR(140) NOT NULL,
    is_other_option BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INT NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_divisions_province
        FOREIGN KEY (province_id)
        REFERENCES provinces(id),
    CONSTRAINT uq_divisions_province_name
        UNIQUE (province_id, name),
    CONSTRAINT uq_divisions_province_slug
        UNIQUE (province_id, slug)
);

CREATE INDEX idx_divisions_province
    ON divisions(province_id);

CREATE INDEX idx_divisions_active
    ON divisions(is_active);

CREATE INDEX idx_divisions_sort
    ON divisions(sort_order);

-- =====================================================
-- GEOGRAPHIC DATA: DISTRICTS
-- =====================================================

CREATE TABLE districts (
    id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    province_id BIGINT UNSIGNED NOT NULL,
    division_id BIGINT UNSIGNED NOT NULL,
    name VARCHAR(120) NOT NULL,
    slug VARCHAR(140) NOT NULL,
    is_other_option BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INT NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_districts_province
        FOREIGN KEY (province_id)
        REFERENCES provinces(id),
    CONSTRAINT fk_districts_division
        FOREIGN KEY (division_id)
        REFERENCES divisions(id),
    CONSTRAINT uq_districts_division_name
        UNIQUE (division_id, name),
    CONSTRAINT uq_districts_division_slug
        UNIQUE (division_id, slug)
);

CREATE INDEX idx_districts_province
    ON districts(province_id);

CREATE INDEX idx_districts_division
    ON districts(division_id);

CREATE INDEX idx_districts_active
    ON districts(is_active);

CREATE INDEX idx_districts_sort
    ON districts(sort_order);

-- =====================================================
-- GEOGRAPHIC DATA: CITIES
-- =====================================================

CREATE TABLE cities (
    id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    province_id BIGINT UNSIGNED NOT NULL,
    division_id BIGINT UNSIGNED NOT NULL,
    district_id BIGINT UNSIGNED NOT NULL,
    name VARCHAR(120) NOT NULL,
    slug VARCHAR(140) NOT NULL,
    postal_code VARCHAR(20) NULL,
    is_other_option BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INT NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_cities_province
        FOREIGN KEY (province_id)
        REFERENCES provinces(id),
    CONSTRAINT fk_cities_division
        FOREIGN KEY (division_id)
        REFERENCES divisions(id),
    CONSTRAINT fk_cities_district
        FOREIGN KEY (district_id)
        REFERENCES districts(id),
    CONSTRAINT uq_cities_district_name
        UNIQUE (district_id, name),
    CONSTRAINT uq_cities_district_slug
        UNIQUE (district_id, slug)
);

CREATE INDEX idx_cities_province
    ON cities(province_id);

CREATE INDEX idx_cities_division
    ON cities(division_id);

CREATE INDEX idx_cities_district
    ON cities(district_id);

CREATE INDEX idx_cities_active
    ON cities(is_active);

CREATE INDEX idx_cities_sort
    ON cities(sort_order);

-- =====================================================
-- GEOGRAPHIC DATA: INTERMEDIATE BOARDS
-- =====================================================

CREATE TABLE intermediate_boards (
    id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(190) NOT NULL,
    slug VARCHAR(220) NOT NULL,
    short_name VARCHAR(80) NULL,
    is_other_option BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INT NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT uq_intermediate_boards_name
        UNIQUE (name),
    CONSTRAINT uq_intermediate_boards_slug
        UNIQUE (slug)
);

CREATE INDEX idx_intermediate_boards_active
    ON intermediate_boards(is_active);

CREATE INDEX idx_intermediate_boards_sort
    ON intermediate_boards(sort_order);

-- =====================================================
-- ORDERS (Safepay + internal refs; created before enrollments for fk_enrollments_order)
-- =====================================================

CREATE TABLE IF NOT EXISTS orders (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  course_id BIGINT NOT NULL,
  enrollment_id BIGINT UNSIGNED NULL,
  gateway VARCHAR(40) NOT NULL DEFAULT 'safepay',
  gateway_order_ref VARCHAR(120) NULL,
  amount INT NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'PKR',
  status ENUM('pending', 'paid', 'failed', 'cancelled', 'refunded') NOT NULL DEFAULT 'pending',
  safepay_token VARCHAR(255) NULL,
  safepay_tracker VARCHAR(255) NULL,
  safepay_transaction_id VARCHAR(255) NULL,
  gateway_payload_json JSON NULL,
  paid_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_orders_course FOREIGN KEY (course_id) REFERENCES courses(id),
  UNIQUE KEY uq_orders_gateway_order_ref (gateway_order_ref),
  KEY idx_orders_user (user_id),
  KEY idx_orders_course (course_id),
  KEY idx_orders_enrollment (enrollment_id),
  KEY idx_orders_status (status),
  KEY idx_orders_safepay_token (safepay_token)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- ENROLLMENTS
-- =====================================================

CREATE TABLE IF NOT EXISTS enrollments (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  course_id BIGINT NOT NULL,
  order_id BIGINT UNSIGNED NULL,
  applicant_full_name VARCHAR(160) NOT NULL,
  father_name VARCHAR(160) NOT NULL,
  date_of_birth DATE NULL,
  gender ENUM('male', 'female') NOT NULL,
  whatsapp_number VARCHAR(20) NOT NULL,
  email VARCHAR(255) NOT NULL,
  province_id BIGINT UNSIGNED NOT NULL,
  division_id BIGINT UNSIGNED NOT NULL,
  district_id BIGINT UNSIGNED NOT NULL,
  city_id BIGINT UNSIGNED NOT NULL,
  board_id BIGINT UNSIGNED NULL,
  hssc_status ENUM('Inter Class', 'First Year Class', 'Matric Class') NOT NULL,
  mdcat_attempt_type ENUM('Fresher', 'Improver') NOT NULL,
  batch_number VARCHAR(20) NULL,
  status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
  access_status ENUM('active', 'inactive', 'revoked') NOT NULL DEFAULT 'inactive',
  admin_note VARCHAR(500) NULL,
  reviewed_by BIGINT NULL,
  reviewed_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_enrollments_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_enrollments_course FOREIGN KEY (course_id) REFERENCES courses(id),
  CONSTRAINT fk_enrollments_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL,
  CONSTRAINT fk_enrollments_province FOREIGN KEY (province_id) REFERENCES provinces(id),
  CONSTRAINT fk_enrollments_division FOREIGN KEY (division_id) REFERENCES divisions(id),
  CONSTRAINT fk_enrollments_district FOREIGN KEY (district_id) REFERENCES districts(id),
  CONSTRAINT fk_enrollments_city FOREIGN KEY (city_id) REFERENCES cities(id),
  CONSTRAINT fk_enrollments_board FOREIGN KEY (board_id) REFERENCES intermediate_boards(id),
  CONSTRAINT fk_enrollments_reviewed_by FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL,
  KEY idx_enrollments_user (user_id),
  KEY idx_enrollments_course (course_id),
  KEY idx_enrollments_order (order_id),
  KEY idx_enrollments_status (status),
  KEY idx_enrollments_user_access (user_id, access_status),
  KEY idx_enrollments_province_id (province_id),
  KEY idx_enrollments_division_id (division_id),
  KEY idx_enrollments_district_id (district_id),
  KEY idx_enrollments_city_id (city_id),
  KEY idx_enrollments_board (board_id),
  KEY idx_enrollments_batch (batch_number)
);

-- Link orders.enrollment_id after both tables exist (avoids circular CREATE dependency)
ALTER TABLE orders
  ADD CONSTRAINT fk_orders_enrollment FOREIGN KEY (enrollment_id) REFERENCES enrollments(id) ON DELETE SET NULL;

-- Legacy course_access removed: course access is defined only on enrollments (status + access_status).

-- =====================================================
-- IDEMPOTENCY (API replay protection)
-- =====================================================

CREATE TABLE IF NOT EXISTS idempotency_keys (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  idempotency_key VARCHAR(255) NOT NULL,
  request_hash CHAR(64) NOT NULL,
  status_code INT NOT NULL,
  response_body JSON NOT NULL,
  user_id BIGINT NULL,
  endpoint VARCHAR(255) NOT NULL,
  method VARCHAR(10) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  UNIQUE KEY uq_idempotency_key (idempotency_key),
  KEY idx_idempotency_expires (expires_at),
  KEY idx_idempotency_user (user_id),
  KEY idx_idempotency_created (created_at),
  CONSTRAINT fk_idempotency_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- COMMUNICATION & LOGGING
-- =====================================================

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

-- =====================================================
-- EMAIL SYSTEM
-- =====================================================

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

-- =====================================================
-- SEED DATA: PROVINCES
-- =====================================================

INSERT INTO provinces (name, slug, is_other_option, is_active, sort_order) VALUES
('Punjab', 'punjab', FALSE, TRUE, 1),
('Sindh', 'sindh', FALSE, TRUE, 2),
('Khyber Pakhtunkhwa', 'khyber-pakhtunkhwa', FALSE, TRUE, 3),
('Balochistan', 'balochistan', FALSE, TRUE, 4),
('Islamabad Capital Territory', 'islamabad-capital-territory', FALSE, TRUE, 5),
('Azad Jammu & Kashmir', 'azad-jammu-kashmir', FALSE, TRUE, 6),
('Gilgit-Baltistan', 'gilgit-baltistan', FALSE, TRUE, 7),
('Other', 'other', TRUE, TRUE, 8);

-- =====================================================
-- SEED DATA: DIVISIONS
-- =====================================================

INSERT INTO divisions (province_id, name, slug, is_other_option, is_active, sort_order) VALUES
-- Punjab (1)
(1, 'Lahore', 'lahore', FALSE, TRUE, 1),
(1, 'Rawalpindi', 'rawalpindi', FALSE, TRUE, 2),
(1, 'Faisalabad', 'faisalabad', FALSE, TRUE, 3),
(1, 'Multan', 'multan', FALSE, TRUE, 4),
(1, 'Gujranwala', 'gujranwala', FALSE, TRUE, 5),
(1, 'Sargodha', 'sargodha', FALSE, TRUE, 6),
(1, 'Bahawalpur', 'bahawalpur', FALSE, TRUE, 7),
(1, 'Sahiwal', 'sahiwal', FALSE, TRUE, 8),
(1, 'DG Khan', 'dg-khan', FALSE, TRUE, 9),
(1, 'Gujrat', 'gujrat', FALSE, TRUE, 10),
-- Sindh (2)
(2, 'Karachi', 'karachi', FALSE, TRUE, 1),
(2, 'Hyderabad', 'hyderabad', FALSE, TRUE, 2),
(2, 'Sukkur', 'sukkur', FALSE, TRUE, 3),
(2, 'Larkana', 'larkana', FALSE, TRUE, 4),
(2, 'Mirpurkhas', 'mirpurkhas', FALSE, TRUE, 5),
(2, 'Shaheed Benazirabad', 'shaheed-benazirabad', FALSE, TRUE, 6),
-- KPK (3)
(3, 'Peshawar', 'peshawar', FALSE, TRUE, 1),
(3, 'Mardan', 'mardan', FALSE, TRUE, 2),
(3, 'Malakand', 'malakand', FALSE, TRUE, 3),
(3, 'Hazara', 'hazara', FALSE, TRUE, 4),
(3, 'Kohat', 'kohat', FALSE, TRUE, 5),
(3, 'Bannu', 'bannu', FALSE, TRUE, 6),
(3, 'Dera Ismail Khan', 'dera-ismail-khan', FALSE, TRUE, 7),
-- Balochistan (4)
(4, 'Quetta', 'quetta', FALSE, TRUE, 1),
(4, 'Kalat', 'kalat', FALSE, TRUE, 2),
(4, 'Makran', 'makran', FALSE, TRUE, 3),
(4, 'Zhob', 'zhob', FALSE, TRUE, 4),
(4, 'Nasirabad', 'nasirabad', FALSE, TRUE, 5),
(4, 'Sibi', 'sibi', FALSE, TRUE, 6),
-- ICT (5)
(5, 'Islamabad', 'islamabad', FALSE, TRUE, 1),
-- AJK (6)
(6, 'Muzaffarabad', 'muzaffarabad', FALSE, TRUE, 1),
(6, 'Mirpur', 'mirpur', FALSE, TRUE, 2),
(6, 'Poonch', 'poonch', FALSE, TRUE, 3),
-- GB (7)
(7, 'Gilgit', 'gilgit', FALSE, TRUE, 1),
(7, 'Baltistan', 'baltistan', FALSE, TRUE, 2),
(7, 'Diamer', 'diamer', FALSE, TRUE, 3);

-- =====================================================
-- SEED DATA: DISTRICTS
-- =====================================================

INSERT INTO districts (province_id, division_id, name, slug, is_other_option, is_active, sort_order) VALUES
-- Punjab > Lahore Division (1)
(1, 1, 'Lahore', 'lahore', FALSE, TRUE, 1),
(1, 1, 'Sheikhupura', 'sheikhupura', FALSE, TRUE, 2),
(1, 1, 'Nankana Sahib', 'nankana-sahib', FALSE, TRUE, 3),
(1, 1, 'Kasur', 'kasur', FALSE, TRUE, 4),
-- Punjab > Rawalpindi Division (2)
(1, 2, 'Rawalpindi', 'rawalpindi', FALSE, TRUE, 1),
(1, 2, 'Attock', 'attock', FALSE, TRUE, 2),
(1, 2, 'Chakwal', 'chakwal', FALSE, TRUE, 3),
(1, 2, 'Jhelum', 'jhelum', FALSE, TRUE, 4),
-- Punjab > Faisalabad Division (3)
(1, 3, 'Faisalabad', 'faisalabad', FALSE, TRUE, 1),
(1, 3, 'Chiniot', 'chiniot', FALSE, TRUE, 2),
(1, 3, 'Jhang', 'jhang', FALSE, TRUE, 3),
(1, 3, 'Toba Tek Singh', 'toba-tek-singh', FALSE, TRUE, 4),
-- Punjab > Multan Division (4)
(1, 4, 'Multan', 'multan', FALSE, TRUE, 1),
(1, 4, 'Khanewal', 'khanewal', FALSE, TRUE, 2),
(1, 4, 'Lodhran', 'lodhran', FALSE, TRUE, 3),
(1, 4, 'Vehari', 'vehari', FALSE, TRUE, 4),
-- Punjab > Gujranwala Division (5)
(1, 5, 'Gujranwala', 'gujranwala', FALSE, TRUE, 1),
(1, 5, 'Gujrat', 'gujrat', FALSE, TRUE, 2),
(1, 5, 'Hafizabad', 'hafizabad', FALSE, TRUE, 3),
(1, 5, 'Mandi Bahauddin', 'mandi-bahauddin', FALSE, TRUE, 4),
(1, 5, 'Narowal', 'narowal', FALSE, TRUE, 5),
(1, 5, 'Sialkot', 'sialkot', FALSE, TRUE, 6),
-- Punjab > Sargodha Division (6)
(1, 6, 'Sargodha', 'sargodha', FALSE, TRUE, 1),
(1, 6, 'Bhakkar', 'bhakkar', FALSE, TRUE, 2),
(1, 6, 'Khushab', 'khushab', FALSE, TRUE, 3),
(1, 6, 'Mianwali', 'mianwali', FALSE, TRUE, 4),
-- Punjab > Bahawalpur Division (7)
(1, 7, 'Bahawalpur', 'bahawalpur', FALSE, TRUE, 1),
(1, 7, 'Bahawalnagar', 'bahawalnagar', FALSE, TRUE, 2),
(1, 7, 'Rahim Yar Khan', 'rahim-yar-khan', FALSE, TRUE, 3),
-- Punjab > Sahiwal Division (8)
(1, 8, 'Sahiwal', 'sahiwal', FALSE, TRUE, 1),
(1, 8, 'Okara', 'okara', FALSE, TRUE, 2),
(1, 8, 'Pakpattan', 'pakpattan', FALSE, TRUE, 3),
-- Punjab > DG Khan Division (9)
(1, 9, 'DG Khan', 'dg-khan', FALSE, TRUE, 1),
(1, 9, 'Layyah', 'layyah', FALSE, TRUE, 2),
(1, 9, 'Muzaffargarh', 'muzaffargarh', FALSE, TRUE, 3),
(1, 9, 'Rajanpur', 'rajanpur', FALSE, TRUE, 4),
-- Punjab > Gujrat Division (10)
(1, 10, 'Gujrat', 'gujrat-d', FALSE, TRUE, 1),
(1, 10, 'Kharian', 'kharian', FALSE, TRUE, 2),
-- Sindh > Karachi Division (11)
(2, 11, 'Karachi East', 'karachi-east', FALSE, TRUE, 1),
(2, 11, 'Karachi West', 'karachi-west', FALSE, TRUE, 2),
(2, 11, 'Karachi Central', 'karachi-central', FALSE, TRUE, 3),
(2, 11, 'Karachi South', 'karachi-south', FALSE, TRUE, 4),
(2, 11, 'Malir', 'malir', FALSE, TRUE, 5),
(2, 11, 'Korangi', 'korangi', FALSE, TRUE, 6),
-- Sindh > Hyderabad Division (12)
(2, 12, 'Hyderabad', 'hyderabad', FALSE, TRUE, 1),
(2, 12, 'Jamshoro', 'jamshoro', FALSE, TRUE, 2),
(2, 12, 'Matiari', 'matiari', FALSE, TRUE, 3),
(2, 12, 'Tando Allahyar', 'tando-allahyar', FALSE, TRUE, 4),
(2, 12, 'Tando Muhammad Khan', 'tando-muhammad-khan', FALSE, TRUE, 5),
-- Sindh > Sukkur Division (13)
(2, 13, 'Sukkur', 'sukkur', FALSE, TRUE, 1),
(2, 13, 'Ghotki', 'ghotki', FALSE, TRUE, 2),
(2, 13, 'Khairpur', 'khairpur', FALSE, TRUE, 3),
-- Sindh > Larkana Division (14)
(2, 14, 'Larkana', 'larkana', FALSE, TRUE, 1),
(2, 14, 'Jacobabad', 'jacobabad', FALSE, TRUE, 2),
(2, 14, 'Kashmore', 'kashmore', FALSE, TRUE, 3),
(2, 14, 'Shikarpur', 'shikarpur', FALSE, TRUE, 4),
-- Sindh > Mirpurkhas Division (15)
(2, 15, 'Mirpurkhas', 'mirpurkhas', FALSE, TRUE, 1),
(2, 15, 'Tharparkar', 'tharparkar', FALSE, TRUE, 2),
(2, 15, 'Umerkot', 'umerkot', FALSE, TRUE, 3),
-- Sindh > Shaheed Benazirabad Division (16)
(2, 16, 'Shaheed Benazirabad', 'shaheed-benazirabad', FALSE, TRUE, 1),
(2, 16, 'Naushahro Feroze', 'naushahro-feroze', FALSE, TRUE, 2),
(2, 16, 'Sanghar', 'sanghar', FALSE, TRUE, 3),
-- KPK > Peshawar Division (17)
(3, 17, 'Peshawar', 'peshawar', FALSE, TRUE, 1),
(3, 17, 'Charsadda', 'charsadda', FALSE, TRUE, 2),
(3, 17, 'Nowshera', 'nowshera', FALSE, TRUE, 3),
-- KPK > Mardan Division (18)
(3, 18, 'Mardan', 'mardan', FALSE, TRUE, 1),
(3, 18, 'Swabi', 'swabi', FALSE, TRUE, 2),
-- KPK > Malakand Division (19)
(3, 19, 'Malakand', 'malakand', FALSE, TRUE, 1),
(3, 19, 'Swat', 'swat', FALSE, TRUE, 2),
(3, 19, 'Dir Lower', 'dir-lower', FALSE, TRUE, 3),
(3, 19, 'Dir Upper', 'dir-upper', FALSE, TRUE, 4),
(3, 19, 'Chitral', 'chitral', FALSE, TRUE, 5),
(3, 19, 'Buner', 'buner', FALSE, TRUE, 6),
(3, 19, 'Shangla', 'shangla', FALSE, TRUE, 7),
-- KPK > Hazara Division (20)
(3, 20, 'Abbottabad', 'abbottabad', FALSE, TRUE, 1),
(3, 20, 'Mansehra', 'mansehra', FALSE, TRUE, 2),
(3, 20, 'Haripur', 'haripur', FALSE, TRUE, 3),
(3, 20, 'Battagram', 'battagram', FALSE, TRUE, 4),
(3, 20, 'Kohistan', 'kohistan', FALSE, TRUE, 5),
-- KPK > Kohat Division (21)
(3, 21, 'Kohat', 'kohat', FALSE, TRUE, 1),
(3, 21, 'Karak', 'karak', FALSE, TRUE, 2),
(3, 21, 'Hangu', 'hangu', FALSE, TRUE, 3),
-- KPK > Bannu Division (22)
(3, 22, 'Bannu', 'bannu', FALSE, TRUE, 1),
(3, 22, 'Lakki Marwat', 'lakki-marwat', FALSE, TRUE, 2),
(3, 22, 'North Waziristan', 'north-waziristan', FALSE, TRUE, 3),
-- KPK > DI Khan Division (23)
(3, 23, 'Dera Ismail Khan', 'dera-ismail-khan', FALSE, TRUE, 1),
(3, 23, 'South Waziristan', 'south-waziristan', FALSE, TRUE, 2),
(3, 23, 'Tank', 'tank', FALSE, TRUE, 3),
-- Balochistan > Quetta Division (24)
(4, 24, 'Quetta', 'quetta', FALSE, TRUE, 1),
(4, 24, 'Pishin', 'pishin', FALSE, TRUE, 2),
(4, 24, 'Killa Abdullah', 'killa-abdullah', FALSE, TRUE, 3),
(4, 24, 'Chagai', 'chagai', FALSE, TRUE, 4),
-- Balochistan > Kalat Division (25)
(4, 25, 'Kalat', 'kalat', FALSE, TRUE, 1),
(4, 25, 'Khuzdar', 'khuzdar', FALSE, TRUE, 2),
(4, 25, 'Mastung', 'mastung', FALSE, TRUE, 3),
-- Balochistan > Makran Division (26)
(4, 26, 'Gwadar', 'gwadar', FALSE, TRUE, 1),
(4, 26, 'Turbat', 'turbat', FALSE, TRUE, 2),
(4, 26, 'Panjgur', 'panjgur', FALSE, TRUE, 3),
-- Balochistan > Zhob Division (27)
(4, 27, 'Zhob', 'zhob', FALSE, TRUE, 1),
(4, 27, 'Sherani', 'sherani', FALSE, TRUE, 2),
(4, 27, 'Musakhel', 'musakhel', FALSE, TRUE, 3),
-- Balochistan > Nasirabad Division (28)
(4, 28, 'Nasirabad', 'nasirabad', FALSE, TRUE, 1),
(4, 28, 'Jaffarabad', 'jaffarabad', FALSE, TRUE, 2),
(4, 28, 'Sohbatpur', 'sohbatpur', FALSE, TRUE, 3),
-- Balochistan > Sibi Division (29)
(4, 29, 'Sibi', 'sibi', FALSE, TRUE, 1),
(4, 29, 'Ziarat', 'ziarat', FALSE, TRUE, 2),
(4, 29, 'Harnai', 'harnai', FALSE, TRUE, 3),
-- ICT > Islamabad Division (30)
(5, 30, 'Islamabad', 'islamabad', FALSE, TRUE, 1),
-- AJK > Muzaffarabad Division (31)
(6, 31, 'Muzaffarabad', 'muzaffarabad', FALSE, TRUE, 1),
(6, 31, 'Neelum', 'neelum', FALSE, TRUE, 2),
-- AJK > Mirpur Division (32)
(6, 32, 'Mirpur', 'mirpur', FALSE, TRUE, 1),
(6, 32, 'Bhimber', 'bhimber', FALSE, TRUE, 2),
(6, 32, 'Kotli', 'kotli', FALSE, TRUE, 3),
-- AJK > Poonch Division (33)
(6, 33, 'Poonch', 'poonch', FALSE, TRUE, 1),
(6, 33, 'Haveli', 'haveli', FALSE, TRUE, 2),
(6, 33, 'Bagh', 'bagh', FALSE, TRUE, 3),
(6, 33, 'Sudhnoti', 'sudhnoti', FALSE, TRUE, 4),
-- GB > Gilgit Division (34)
(7, 34, 'Gilgit', 'gilgit', FALSE, TRUE, 1),
(7, 34, 'Hunza', 'hunza', FALSE, TRUE, 2),
(7, 34, 'Nagar', 'nagar', FALSE, TRUE, 3),
-- GB > Baltistan Division (35)
(7, 35, 'Skardu', 'skardu', FALSE, TRUE, 1),
(7, 35, 'Shigar', 'shigar', FALSE, TRUE, 2),
(7, 35, 'Kharmang', 'kharmang', FALSE, TRUE, 3),
(7, 35, 'Roundu', 'roundu', FALSE, TRUE, 4),
-- GB > Diamer Division (36)
(7, 36, 'Diamer', 'diamer', FALSE, TRUE, 1),
(7, 36, 'Darel', 'darel', FALSE, TRUE, 2),
(7, 36, 'Tangir', 'tangir', FALSE, TRUE, 3);

-- =====================================================
-- SEED DATA: CITIES (major cities per district)
-- =====================================================

INSERT INTO cities (province_id, division_id, district_id, name, slug, is_other_option, is_active, sort_order) VALUES
-- Punjab > Lahore > Lahore (1)
(1, 1, 1, 'Lahore', 'lahore', FALSE, TRUE, 1),
(1, 1, 1, 'Bahria Town Lahore', 'bahria-town-lahore', FALSE, TRUE, 2),
(1, 1, 1, 'DHA Lahore', 'dha-lahore', FALSE, TRUE, 3),
-- Punjab > Lahore > Sheikhupura (2)
(1, 1, 2, 'Sheikhupura', 'sheikhupura', FALSE, TRUE, 1),
(1, 1, 2, 'Muridke', 'muridke', FALSE, TRUE, 2),
-- Punjab > Lahore > Nankana Sahib (3)
(1, 1, 3, 'Nankana Sahib', 'nankana-sahib', FALSE, TRUE, 1),
-- Punjab > Lahore > Kasur (4)
(1, 1, 4, 'Kasur', 'kasur', FALSE, TRUE, 1),
(1, 1, 4, 'Chunian', 'chunian', FALSE, TRUE, 2),
-- Punjab > Rawalpindi > Rawalpindi (5)
(1, 2, 5, 'Rawalpindi', 'rawalpindi', FALSE, TRUE, 1),
(1, 2, 5, 'Bahria Town Rawalpindi', 'bahria-town-rawalpindi', FALSE, TRUE, 2),
(1, 2, 5, 'Murree', 'murree', FALSE, TRUE, 3),
-- Punjab > Rawalpindi > Attock (6)
(1, 2, 6, 'Attock', 'attock', FALSE, TRUE, 1),
(1, 2, 6, 'Hazro', 'hazro', FALSE, TRUE, 2),
-- Punjab > Rawalpindi > Chakwal (7)
(1, 2, 7, 'Chakwal', 'chakwal', FALSE, TRUE, 1),
-- Punjab > Rawalpindi > Jhelum (8)
(1, 2, 8, 'Jhelum', 'jhelum', FALSE, TRUE, 1),
(1, 2, 8, 'Sohawa', 'sohawa', FALSE, TRUE, 2),
-- Punjab > Faisalabad > Faisalabad (9)
(1, 3, 9, 'Faisalabad', 'faisalabad', FALSE, TRUE, 1),
(1, 3, 9, 'Jaranwala', 'jaranwala', FALSE, TRUE, 2),
(1, 3, 9, 'Samundri', 'samundri', FALSE, TRUE, 3),
-- Punjab > Faisalabad > Chiniot (10)
(1, 3, 10, 'Chiniot', 'chiniot', FALSE, TRUE, 1),
-- Punjab > Faisalabad > Jhang (11)
(1, 3, 11, 'Jhang', 'jhang', FALSE, TRUE, 1),
(1, 3, 11, 'Shorkot', 'shorkot', FALSE, TRUE, 2),
-- Punjab > Faisalabad > Toba Tek Singh (12)
(1, 3, 12, 'Toba Tek Singh', 'toba-tek-singh', FALSE, TRUE, 1),
(1, 3, 12, 'Gojra', 'gojra', FALSE, TRUE, 2),
-- Punjab > Multan > Multan (13)
(1, 4, 13, 'Multan', 'multan', FALSE, TRUE, 1),
(1, 4, 13, 'Shujabad', 'shujabad', FALSE, TRUE, 2),
-- Punjab > Multan > Khanewal (14)
(1, 4, 14, 'Khanewal', 'khanewal', FALSE, TRUE, 1),
(1, 4, 14, 'Mian Channu', 'mian-channu', FALSE, TRUE, 2),
-- Punjab > Multan > Lodhran (15)
(1, 4, 15, 'Lodhran', 'lodhran', FALSE, TRUE, 1),
-- Punjab > Multan > Vehari (16)
(1, 4, 16, 'Vehari', 'vehari', FALSE, TRUE, 1),
(1, 4, 16, 'Burewala', 'burewala', FALSE, TRUE, 2),
-- Punjab > Gujranwala > Gujranwala (17)
(1, 5, 17, 'Gujranwala', 'gujranwala', FALSE, TRUE, 1),
(1, 5, 17, 'Kamoke', 'kamoke', FALSE, TRUE, 2),
-- Punjab > Gujranwala > Sialkot (22)
(1, 5, 22, 'Sialkot', 'sialkot', FALSE, TRUE, 1),
(1, 5, 22, 'Daska', 'daska', FALSE, TRUE, 2),
(1, 5, 22, 'Wazirabad', 'wazirabad', FALSE, TRUE, 3),
-- Punjab > Sargodha > Sargodha (23)
(1, 6, 23, 'Sargodha', 'sargodha', FALSE, TRUE, 1),
(1, 6, 23, 'Bhalwal', 'bhalwal', FALSE, TRUE, 2),
-- Punjab > Bahawalpur > Bahawalpur (27)
(1, 7, 27, 'Bahawalpur', 'bahawalpur', FALSE, TRUE, 1),
(1, 7, 27, 'Ahmadpur East', 'ahmadpur-east', FALSE, TRUE, 2),
-- Punjab > Bahawalpur > Rahim Yar Khan (29)
(1, 7, 29, 'Rahim Yar Khan', 'rahim-yar-khan', FALSE, TRUE, 1),
(1, 7, 29, 'Sadiqabad', 'sadiqabad', FALSE, TRUE, 2),
-- Sindh > Karachi > Karachi South (44)
(2, 11, 44, 'Karachi', 'karachi', FALSE, TRUE, 1),
(2, 11, 44, 'Clifton', 'clifton', FALSE, TRUE, 2),
(2, 11, 44, 'Saddar', 'saddar', FALSE, TRUE, 3),
-- Sindh > Karachi > Karachi East (41)
(2, 11, 41, 'Gulshan-e-Iqbal', 'gulshan-e-iqbal', FALSE, TRUE, 1),
(2, 11, 41, 'Gulberg', 'gulberg', FALSE, TRUE, 2),
(2, 11, 41, 'North Nazimabad', 'north-nazimabad', FALSE, TRUE, 3),
-- Sindh > Karachi > Malir (45)
(2, 11, 45, 'Malir', 'malir', FALSE, TRUE, 1),
(2, 11, 45, 'Bin Qasim', 'bin-qasim', FALSE, TRUE, 2),
-- Sindh > Hyderabad > Hyderabad (47)
(2, 12, 47, 'Hyderabad', 'hyderabad', FALSE, TRUE, 1),
(2, 12, 47, 'Qasimabad', 'qasimabad', FALSE, TRUE, 2),
(2, 12, 47, 'Latifabad', 'latifabad', FALSE, TRUE, 3),
-- Sindh > Sukkur > Sukkur (51)
(2, 13, 51, 'Sukkur', 'sukkur', FALSE, TRUE, 1),
-- Sindh > Sukkur > Khairpur (53)
(2, 13, 53, 'Khairpur', 'khairpur', FALSE, TRUE, 1),
(2, 13, 53, 'Kingri', 'kingri', FALSE, TRUE, 2),
-- Sindh > Larkana > Larkana (54)
(2, 14, 54, 'Larkana', 'larkana', FALSE, TRUE, 1),
-- Sindh > Larkana > Jacobabad (55)
(2, 14, 55, 'Jacobabad', 'jacobabad', FALSE, TRUE, 1),
-- Sindh > Larkana > Shikarpur (57)
(2, 14, 57, 'Shikarpur', 'shikarpur', FALSE, TRUE, 1),
-- KPK > Peshawar > Peshawar (67)
(3, 17, 67, 'Peshawar', 'peshawar', FALSE, TRUE, 1),
(3, 17, 67, 'Hayatabad', 'hayatabad', FALSE, TRUE, 2),
(3, 17, 67, 'University Town', 'university-town', FALSE, TRUE, 3),
-- KPK > Peshawar > Charsadda (68)
(3, 17, 68, 'Charsadda', 'charsadda', FALSE, TRUE, 1),
-- KPK > Peshawar > Nowshera (69)
(3, 17, 69, 'Nowshera', 'nowshera', FALSE, TRUE, 1),
-- KPK > Hazara > Abbottabad (77)
(3, 20, 77, 'Abbottabad', 'abbottabad', FALSE, TRUE, 1),
(3, 20, 77, 'Havelian', 'havelian', FALSE, TRUE, 2),
-- KPK > Hazara > Mansehra (78)
(3, 20, 78, 'Mansehra', 'mansehra', FALSE, TRUE, 1),
-- KPK > Hazara > Haripur (79)
(3, 20, 79, 'Haripur', 'haripur', FALSE, TRUE, 1),
-- KPK > Swat (71)
(3, 19, 71, 'Swat', 'swat', FALSE, TRUE, 1),
(3, 19, 71, 'Mingora', 'mingora', FALSE, TRUE, 2),
-- Balochistan > Quetta > Quetta (101)
(4, 24, 101, 'Quetta', 'quetta', FALSE, TRUE, 1),
(4, 24, 101, 'Satellite Town Quetta', 'satellite-town-quetta', FALSE, TRUE, 2),
-- Balochistan > Makran > Gwadar (107)
(4, 26, 107, 'Gwadar', 'gwadar', FALSE, TRUE, 1),
-- ICT > Islamabad (116)
(5, 30, 116, 'Islamabad', 'islamabad', FALSE, TRUE, 1),
(5, 30, 116, 'F-6', 'f-6', FALSE, TRUE, 2),
(5, 30, 116, 'F-7', 'f-7', FALSE, TRUE, 3),
(5, 30, 116, 'F-8', 'f-8', FALSE, TRUE, 4),
(5, 30, 116, 'G-9', 'g-9', FALSE, TRUE, 5),
(5, 30, 116, 'G-10', 'g-10', FALSE, TRUE, 6),
(5, 30, 116, 'G-11', 'g-11', FALSE, TRUE, 7),
(5, 30, 116, 'Bahria Town Islamabad', 'bahria-town-islamabad', FALSE, TRUE, 8),
(5, 30, 116, 'DHA Islamabad', 'dha-islamabad', FALSE, TRUE, 9),
-- AJK > Muzaffarabad (117)
(6, 31, 117, 'Muzaffarabad', 'muzaffarabad', FALSE, TRUE, 1),
-- AJK > Mirpur (119)
(6, 32, 119, 'Mirpur', 'mirpur', FALSE, TRUE, 1),
(6, 32, 119, 'New Mirpur City', 'new-mirpur-city', FALSE, TRUE, 2),
-- GB > Gilgit (125)
(7, 34, 125, 'Gilgit', 'gilgit', FALSE, TRUE, 1),
-- GB > Baltistan > Skardu (128)
(7, 35, 128, 'Skardu', 'skardu', FALSE, TRUE, 1);

-- =====================================================
-- SEED DATA: INTERMEDIATE BOARDS
-- =====================================================

INSERT INTO intermediate_boards (name, slug, short_name, is_other_option, is_active, sort_order) VALUES
-- Punjab Boards
('Board of Intermediate and Secondary Education Lahore', 'bise-lahore', 'BISE Lahore', FALSE, TRUE, 1),
('Board of Intermediate and Secondary Education Rawalpindi', 'bise-rawalpindi', 'BISE Rawalpindi', FALSE, TRUE, 2),
('Board of Intermediate and Secondary Education Faisalabad', 'bise-faisalabad', 'BISE Faisalabad', FALSE, TRUE, 3),
('Board of Intermediate and Secondary Education Multan', 'bise-multan', 'BISE Multan', FALSE, TRUE, 4),
('Board of Intermediate and Secondary Education Gujranwala', 'bise-gujranwala', 'BISE Gujranwala', FALSE, TRUE, 5),
('Board of Intermediate and Secondary Education Sargodha', 'bise-sargodha', 'BISE Sargodha', FALSE, TRUE, 6),
('Board of Intermediate and Secondary Education Bahawalpur', 'bise-bahawalpur', 'BISE Bahawalpur', FALSE, TRUE, 7),
('Board of Intermediate and Secondary Education Sahiwal', 'bise-sahiwal', 'BISE Sahiwal', FALSE, TRUE, 8),
('Board of Intermediate and Secondary Education DG Khan', 'bise-dg-khan', 'BISE DG Khan', FALSE, TRUE, 9),
-- Sindh Boards
('Board of Intermediate Education Karachi', 'bie-karachi', 'BIE Karachi', FALSE, TRUE, 10),
('Board of Intermediate and Secondary Education Hyderabad', 'bise-hyderabad', 'BISE Hyderabad', FALSE, TRUE, 11),
('Board of Intermediate and Secondary Education Sukkur', 'bise-sukkur', 'BISE Sukkur', FALSE, TRUE, 12),
('Board of Intermediate and Secondary Education Larkana', 'bise-larkana', 'BISE Larkana', FALSE, TRUE, 13),
('Board of Intermediate and Secondary Education Mirpurkhas', 'bise-mirpurkhas', 'BISE Mirpurkhas', FALSE, TRUE, 14),
('Board of Intermediate and Secondary Education Shaheed Benazirabad', 'bise-shaheed-benazirabad', 'BISE SBA', FALSE, TRUE, 15),
-- KPK Boards
('Board of Intermediate and Secondary Education Peshawar', 'bise-peshawar', 'BISE Peshawar', FALSE, TRUE, 16),
('Board of Intermediate and Secondary Education Mardan', 'bise-mardan', 'BISE Mardan', FALSE, TRUE, 17),
('Board of Intermediate and Secondary Education Swat', 'bise-swat', 'BISE Swat', FALSE, TRUE, 18),
('Board of Intermediate and Secondary Education Abbottabad', 'bise-abbottabad', 'BISE Abbottabad', FALSE, TRUE, 19),
('Board of Intermediate and Secondary Education Kohat', 'bise-kohat', 'BISE Kohat', FALSE, TRUE, 20),
('Board of Intermediate and Secondary Education Bannu', 'bise-bannu', 'BISE Bannu', FALSE, TRUE, 21),
('Board of Intermediate and Secondary Education DI Khan', 'bise-di-khan', 'BISE DI Khan', FALSE, TRUE, 22),
('Board of Intermediate and Secondary Education Malakand', 'bise-malakand', 'BISE Malakand', FALSE, TRUE, 23),
-- Balochistan Boards
('Board of Intermediate and Secondary Education Quetta', 'bise-quetta', 'BISE Quetta', FALSE, TRUE, 24),
('Board of Intermediate and Secondary Education Turbat', 'bise-turbat', 'BISE Turbat', FALSE, TRUE, 25),
('Board of Intermediate and Secondary Education Khuzdar', 'bise-khuzdar', 'BISE Khuzdar', FALSE, TRUE, 26),
-- Federal & Other
('Federal Board of Intermediate and Secondary Education', 'fbise', 'FBISE', FALSE, TRUE, 27),
('Aga Khan University Examination Board', 'aku-eb', 'AKU-EB', FALSE, TRUE, 28),
('Board of Intermediate and Secondary Education AJK', 'bise-ajk', 'BISE AJK', FALSE, TRUE, 29),
('Board of Intermediate Gilgit-Baltistan', 'bi-gilgit-baltistan', 'BI GB', FALSE, TRUE, 30),
('Other', 'other', 'Other', TRUE, TRUE, 31);

-- =====================================================
-- MIGRATION HOOKS (idempotent — safe when schema.sql re-run)
-- =====================================================

-- Phase-1: chapters + optional lecture chapter link (backward compatible).
-- Drop legacy chapters shape (old index names) so CREATE IF NOT EXISTS can recreate; DATA LOSS on chapters rows.
SET @chapters_tbl := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'chapters'
);
SET @idx_subject_id_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'chapters' AND INDEX_NAME = 'idx_subject_id'
);
SET @sql_drop_chapters := IF(
  @chapters_tbl > 0 AND @idx_subject_id_exists = 0,
  'DROP TABLE chapters',
  'SELECT 1'
);
PREPARE stmt_drop_chapters FROM @sql_drop_chapters;
EXECUTE stmt_drop_chapters;
DEALLOCATE PREPARE stmt_drop_chapters;

CREATE TABLE IF NOT EXISTS chapters (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,

  subject_id BIGINT NOT NULL,

  title VARCHAR(255) NOT NULL,
  description TEXT DEFAULT NULL,

  order_index INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,

  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  KEY idx_subject_id (subject_id),
  KEY idx_subject_order (subject_id, order_index),

  CONSTRAINT fk_chapters_subject
    FOREIGN KEY (subject_id)
    REFERENCES subjects(id)
    ON DELETE CASCADE
);

DROP TABLE IF EXISTS course_access;

SET @db := DATABASE();
SET @allow_migr := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'enrollments'
);
SET @col_raw := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'enrollments' AND COLUMN_NAME = 'access_status'
);
SET @access_col_type := (
  SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'enrollments' AND COLUMN_NAME = 'access_status'
  LIMIT 1
);
SET @sql_add_col := IF(
  @allow_migr = 0,
  'SELECT 1',
  IF(
    @col_raw = 0,
    'ALTER TABLE enrollments ADD COLUMN access_status ENUM(''active'', ''inactive'', ''revoked'') NOT NULL DEFAULT ''inactive'' AFTER status',
    'SELECT 1'
  )
);
PREPARE stmt_add_access_col FROM @sql_add_col;
EXECUTE stmt_add_access_col;
DEALLOCATE PREPARE stmt_add_access_col;

SET @needs_enum_upgrade := (
  @allow_migr > 0 AND @col_raw > 0 AND IFNULL(@access_col_type, '') NOT LIKE '%revoked%'
);
SET @sql_modify_access_enum := IF(
  @needs_enum_upgrade,
  'ALTER TABLE enrollments MODIFY COLUMN access_status ENUM(''active'', ''inactive'', ''revoked'') NOT NULL DEFAULT ''inactive''',
  'SELECT 1'
);
PREPARE stmt_modify_access_enum FROM @sql_modify_access_enum;
EXECUTE stmt_modify_access_enum;
DEALLOCATE PREPARE stmt_modify_access_enum;

SET @idx_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'enrollments' AND INDEX_NAME = 'idx_enrollments_user_access'
);
SET @sql_add_idx := IF(
  @allow_migr = 0,
  'SELECT 1',
  IF(
    @idx_exists = 0,
    'ALTER TABLE enrollments ADD KEY idx_enrollments_user_access (user_id, access_status)',
    'SELECT 1'
  )
);
PREPARE stmt_add_access_idx FROM @sql_add_idx;
EXECUTE stmt_add_access_idx;
DEALLOCATE PREPARE stmt_add_access_idx;

-- Phase 3D Step 1: lectures.chapter_id foundation (nullable; no FK/NOT NULL yet).
-- Standalone runner: sql/migrations/phase3d_step1_lectures_chapter_id.sql
-- Rollback:          sql/migrations/phase3d_step1_lectures_chapter_id_rollback.sql
SET @lectures_allow := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'lectures'
);
SET @lectures_chapter_col := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'lectures' AND COLUMN_NAME = 'chapter_id'
);
SET @sql_lectures_add_chapter := IF(
  @lectures_allow = 0 OR @lectures_chapter_col > 0,
  'SELECT 1',
  'ALTER TABLE lectures ADD COLUMN chapter_id BIGINT UNSIGNED NULL AFTER course_id'
);
PREPARE stmt_lectures_add_chapter FROM @sql_lectures_add_chapter;
EXECUTE stmt_lectures_add_chapter;
DEALLOCATE PREPARE stmt_lectures_add_chapter;

SET @lectures_chapter_idx := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'lectures' AND INDEX_NAME = 'idx_lectures_chapter_id'
);
SET @sql_lectures_add_chapter_idx := IF(
  @lectures_allow = 0 OR @lectures_chapter_idx > 0,
  'SELECT 1',
  'ALTER TABLE lectures ADD KEY idx_lectures_chapter_id (chapter_id)'
);
PREPARE stmt_lectures_add_chapter_idx FROM @sql_lectures_add_chapter_idx;
EXECUTE stmt_lectures_add_chapter_idx;
DEALLOCATE PREPARE stmt_lectures_add_chapter_idx;

-- CEE: tests.course_id for entitlement-scoped test access
SET @tests_allow := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'tests'
);
SET @tests_course_col := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'tests' AND COLUMN_NAME = 'course_id'
);
SET @sql_tests_add_course := IF(
  @tests_allow = 0 OR @tests_course_col > 0,
  'SELECT 1',
  'ALTER TABLE tests ADD COLUMN course_id BIGINT NULL AFTER id'
);
PREPARE stmt_tests_add_course FROM @sql_tests_add_course;
EXECUTE stmt_tests_add_course;
DEALLOCATE PREPARE stmt_tests_add_course;

SET @tests_course_idx := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'tests'
    AND INDEX_NAME IN ('idx_tests_course', 'idx_course')
);
SET @sql_tests_add_idx := IF(
  @tests_allow = 0 OR @tests_course_idx > 0,
  'SELECT 1',
  'ALTER TABLE tests ADD KEY idx_course (course_id)'
);
PREPARE stmt_tests_add_idx FROM @sql_tests_add_idx;
EXECUTE stmt_tests_add_idx;
DEALLOCATE PREPARE stmt_tests_add_idx;







