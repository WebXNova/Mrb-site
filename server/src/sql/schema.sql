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
  password_hash VARCHAR(255) NULL,
  google_sub VARCHAR(255) NULL UNIQUE,
  full_name VARCHAR(120) NOT NULL,
  avatar_url VARCHAR(512) NULL,
  is_verified BOOLEAN NOT NULL DEFAULT FALSE,
  last_verification_sent_at TIMESTAMP NULL DEFAULT NULL,
  verification_send_failures INT NOT NULL DEFAULT 0,
  token_version INT NOT NULL DEFAULT 0,
  risk_level ENUM('normal', 'elevated', 'critical') NOT NULL DEFAULT 'normal',
  role ENUM('student', 'teacher', 'admin', 'super_admin') NOT NULL DEFAULT 'student',
  status ENUM('active', 'inactive', 'suspended') NOT NULL DEFAULT 'active',
  -- status enum migration: sql/migrations/users_status_add_inactive.sql
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

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  used_at TIMESTAMP NULL DEFAULT NULL,
  issued_ip VARCHAR(64) NULL,
  issued_user_agent VARCHAR(300) NULL,
  consumed_ip VARCHAR(64) NULL,
  consumed_user_agent VARCHAR(300) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_password_reset_tokens_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  KEY idx_password_reset_tokens_token_hash (token_hash),
  KEY idx_password_reset_tokens_reset_lookup (token_hash, used_at, expires_at),
  KEY idx_password_reset_tokens_user_id (user_id),
  KEY idx_password_reset_tokens_expires_at (expires_at)
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
  start_date DATE NULL COMMENT 'Course start date',
  end_date DATE NULL COMMENT 'Course end date',
  admission_status ENUM('OPEN', 'CLOSED') NOT NULL DEFAULT 'CLOSED' COMMENT 'Admission status for enrollment',
  is_active BOOLEAN DEFAULT TRUE,
  created_by BIGINT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT chk_course_dates CHECK (start_date IS NULL OR end_date IS NULL OR start_date <= end_date),
  KEY idx_courses_admission_status (admission_status),
  KEY idx_courses_start_date (start_date),
  KEY idx_courses_end_date (end_date)
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

-- Teacher ↔ subject assignments (teachers are users with role='teacher'; no separate teachers table).
-- Up:       sql/migrations/teacher_subjects.sql
-- Rollback: sql/migrations/teacher_subjects_rollback.sql
-- Node:     src/db/ensureTeacherSubjectsSchema.js
CREATE TABLE IF NOT EXISTS teacher_subjects (
  teacher_id BIGINT NOT NULL,
  subject_id BIGINT NOT NULL,
  assigned_by BIGINT NULL,
  assigned_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (teacher_id, subject_id),
  KEY idx_teacher_subjects_subject (subject_id),
  KEY idx_teacher_subjects_assigned_by (assigned_by),
  CONSTRAINT fk_teacher_subjects_teacher FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_teacher_subjects_subject FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
  CONSTRAINT fk_teacher_subjects_assigned_by FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
  start_date DATETIME NOT NULL,
  end_date DATETIME NOT NULL,
  total_seats INT NOT NULL,
  seats_filled INT NOT NULL DEFAULT 0,
  instructor_name VARCHAR(160) NULL,
  schedule_label VARCHAR(180) NULL,
  timezone VARCHAR(80) NOT NULL DEFAULT 'UTC',
  status VARCHAR(40) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  show_publicly TINYINT(1) NOT NULL DEFAULT 1,
  recordings_enabled TINYINT(1) NOT NULL DEFAULT 1,
  sequential_lectures_enabled TINYINT(1) NOT NULL DEFAULT 0,
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

CREATE TABLE IF NOT EXISTS lecture_progress (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  lecture_id BIGINT NOT NULL,
  course_id BIGINT NOT NULL,
  status ENUM('completed') NOT NULL DEFAULT 'completed',
  completed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_lecture_progress_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_lecture_progress_lecture FOREIGN KEY (lecture_id) REFERENCES lectures(id) ON DELETE CASCADE,
  CONSTRAINT fk_lecture_progress_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
  UNIQUE KEY uq_lecture_progress_user_lecture (user_id, lecture_id),
  KEY idx_lecture_progress_user_course (user_id, course_id),
  KEY idx_lecture_progress_course (course_id)
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
  category VARCHAR(80) NOT NULL DEFAULT 'MDCAT',
  test_type VARCHAR(50) NOT NULL DEFAULT 'subject_wise',
  duration_minutes INT NOT NULL,
  passing_marks DECIMAL(8,2) NOT NULL DEFAULT 0.00,
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

CREATE TABLE IF NOT EXISTS test_subjects (
  test_id BIGINT NOT NULL,
  subject_id BIGINT NOT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (test_id, subject_id),
  KEY idx_test_subjects_subject (subject_id),
  CONSTRAINT fk_test_subjects_test FOREIGN KEY (test_id) REFERENCES tests(id) ON DELETE CASCADE,
  CONSTRAINT fk_test_subjects_subject FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS question_bank (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  course_id BIGINT NOT NULL,
  subject_id BIGINT NULL,
  topic VARCHAR(255) NULL,
  difficulty VARCHAR(50) NULL,
  question_type VARCHAR(50) NOT NULL,
  question_text LONGTEXT NOT NULL,
  question_html LONGTEXT NULL,
  question_image_url VARCHAR(1000) NULL,
  explanation LONGTEXT NULL,
  explanation_html LONGTEXT NULL,
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
--
-- question_bank / question_options image URL columns:
-- Up:       sql/migrations/question_bank_option_image_urls.sql
-- Rollback: sql/migrations/question_bank_option_image_urls_rollback.sql
--
-- question_bank / question_options rich HTML columns (question_html, explanation_html, option_html):
-- Up:       sql/migrations/question_bank_rich_html_columns.sql
-- Rollback: sql/migrations/question_bank_rich_html_columns_rollback.sql
-- Node:     src/db/ensureQuestionBankRichHtmlSchema.js

CREATE TABLE IF NOT EXISTS question_options (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  question_id BIGINT NOT NULL,
  option_key CHAR(1) NOT NULL,
  option_text LONGTEXT NOT NULL,
  option_html LONGTEXT NULL,
  image_url VARCHAR(1000) NULL,
  is_correct TINYINT(1) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_question (question_id),
  UNIQUE KEY uq_question_option_key (question_id, option_key),
  CONSTRAINT fk_option_question FOREIGN KEY (question_id) REFERENCES question_bank(id) ON DELETE CASCADE,
  CONSTRAINT chk_option_key_mcq CHECK (option_key IN ('A','B','C','D'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- option_key + single-correct triggers (existing DBs):
-- Up:       sql/migrations/question_options_option_key.sql
-- Rollback: sql/migrations/question_options_option_key_rollback.sql
--
-- option count / orphan / is_correct hardening:
-- Up:       sql/migrations/question_options_integrity_hardening.sql
-- Rollback: sql/migrations/question_options_integrity_hardening_rollback.sql




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

-- Per-question import audit trail (batch ↔ question linkage):
-- Up:       sql/migrations/question_import_batch_items.sql
-- Rollback: sql/migrations/question_import_batch_items_rollback.sql
-- Node:     src/db/ensureQuestionImportBatchItemsSchema.js

CREATE TABLE IF NOT EXISTS question_import_batch_items (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  batch_id BIGINT NOT NULL,
  question_number INT NOT NULL,
  question_title VARCHAR(500) NULL,
  question_id BIGINT NULL,
  status VARCHAR(20) NOT NULL,
  error_code VARCHAR(100) NULL,
  error_message VARCHAR(1000) NULL,
  validation_layer VARCHAR(50) NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_import_batch_question (batch_id, question_number),
  KEY idx_import_items_batch (batch_id),
  KEY idx_import_items_question (question_id),
  KEY idx_import_items_status (batch_id, status),
  KEY idx_import_items_created (created_at),
  CONSTRAINT fk_import_items_batch FOREIGN KEY (batch_id) REFERENCES question_import_batches(id) ON DELETE CASCADE,
  CONSTRAINT fk_import_items_question FOREIGN KEY (question_id) REFERENCES question_bank(id) ON DELETE SET NULL,
  CONSTRAINT chk_import_item_status CHECK (status IN ('SUCCESS', 'FAILED', 'SKIPPED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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

CREATE TABLE IF NOT EXISTS test_quiz_drafts (
  draft_id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  test_id BIGINT NOT NULL,
  draft_payload JSON NOT NULL,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  created_by BIGINT NOT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  deleted_by BIGINT NULL,
  materialized_version INT UNSIGNED NULL DEFAULT NULL,
  materialized_at TIMESTAMP NULL DEFAULT NULL,
  UNIQUE KEY uq_test_quiz_drafts_test_id (test_id),
  KEY idx_test_quiz_drafts_created_by (created_by),
  KEY idx_test_quiz_drafts_updated_at (updated_at),
  KEY idx_test_quiz_drafts_deleted_at (deleted_at),
  CONSTRAINT fk_tqd_test FOREIGN KEY (test_id) REFERENCES tests(id) ON DELETE CASCADE,
  CONSTRAINT fk_tqd_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_tqd_deleted_by FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT chk_tqd_version_positive CHECK (version >= 1)
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
  delivery_layout_json JSON NULL,
  result_id BIGINT NULL,
  submitted_at DATETIME NULL,
  completion_reason VARCHAR(50) NULL,
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
  KEY idx_test_attempts_test_student_status (test_id, student_id, status),
  KEY idx_test_attempts_user_status (user_id, status),
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
-- GEOGRAPHIC DATA: DISTRICTS
-- =====================================================

CREATE TABLE districts (
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
    CONSTRAINT fk_districts_province
        FOREIGN KEY (province_id)
        REFERENCES provinces(id),
    CONSTRAINT uq_districts_province_slug
        UNIQUE (province_id, slug)
);

CREATE INDEX idx_districts_province
    ON districts(province_id);

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
  cancellation_reason VARCHAR(64) NULL,
  cancelled_at TIMESTAMP NULL,
  pending_enrollment_id BIGINT UNSIGNED
    GENERATED ALWAYS AS (IF(status = 'pending', enrollment_id, NULL)) VIRTUAL,
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
  UNIQUE KEY uq_orders_one_pending_per_enrollment (pending_enrollment_id),
  KEY idx_orders_user (user_id),
  KEY idx_orders_course (course_id),
  KEY idx_orders_enrollment (enrollment_id),
  KEY idx_orders_enrollment_status (enrollment_id, status),
  KEY idx_orders_status (status),
  KEY idx_orders_safepay_token (safepay_token)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- PROCESSED WEBHOOKS (Safepay replay ledger — H-04/H-05)
-- =====================================================

CREATE TABLE IF NOT EXISTS processed_webhooks (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  webhook_hash CHAR(64) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_processed_webhooks_hash (webhook_hash),
  KEY idx_processed_webhooks_created_at (created_at)
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
  district_id BIGINT UNSIGNED NOT NULL,
  city_id BIGINT UNSIGNED NOT NULL,
  board_id BIGINT UNSIGNED NULL,
  hssc_status ENUM('Inter Class', 'First Year Class', 'Matric Class') NOT NULL,
  mdcat_attempt_type ENUM('Fresher', 'Improver') NOT NULL,
  status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
  access_status ENUM('active', 'inactive', 'revoked') NOT NULL DEFAULT 'inactive',
  active_user_id BIGINT GENERATED ALWAYS AS (IF(access_status = 'active', user_id, NULL)) VIRTUAL,
  enrollment_source ENUM('free', 'paid') NULL DEFAULT NULL,
  switch_confirmed_at TIMESTAMP NULL DEFAULT NULL,
  admin_note VARCHAR(500) NULL,
  reviewed_by BIGINT NULL,
  reviewed_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_enrollments_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_enrollments_course FOREIGN KEY (course_id) REFERENCES courses(id),
  CONSTRAINT fk_enrollments_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL,
  CONSTRAINT fk_enrollments_province FOREIGN KEY (province_id) REFERENCES provinces(id),
  CONSTRAINT fk_enrollments_district FOREIGN KEY (district_id) REFERENCES districts(id),
  CONSTRAINT fk_enrollments_city FOREIGN KEY (city_id) REFERENCES cities(id),
  CONSTRAINT fk_enrollments_board FOREIGN KEY (board_id) REFERENCES intermediate_boards(id),
  CONSTRAINT fk_enrollments_reviewed_by FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE KEY uq_enrollments_user_course (user_id, course_id),
  UNIQUE KEY uq_enrollments_one_active_per_user (active_user_id),
  KEY idx_enrollments_user (user_id),
  KEY idx_enrollments_course (course_id),
  KEY idx_enrollments_order (order_id),
  KEY idx_enrollments_status (status),
  KEY idx_enrollments_user_access (user_id, access_status),
  KEY idx_enrollments_province_id (province_id),
  KEY idx_enrollments_district_id (district_id),
  KEY idx_enrollments_city_id (city_id),
  KEY idx_enrollments_board (board_id)
);

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
  INDEX idx_activity_logs_user_created_at (user_id, created_at),
  INDEX idx_activity_logs_created_at (created_at),
  INDEX idx_activity_logs_action_created_at (action, created_at)
);

CREATE TABLE IF NOT EXISTS contact_remarks (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(120) NULL,
  email VARCHAR(255) NULL,
  whatsapp VARCHAR(20) NULL,
  message TEXT NOT NULL,
  page_url VARCHAR(255) NULL,
  status ENUM('new', 'read') NOT NULL DEFAULT 'new',
  posted TINYINT(1) NOT NULL DEFAULT 0,
  posted_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_contact_remarks_status_created (status, created_at DESC),
  KEY idx_contact_remarks_created (created_at DESC),
  KEY idx_contact_remarks_posted (posted, posted_at DESC),
  KEY idx_contact_remarks_whatsapp_created (whatsapp, created_at DESC)
);

CREATE TABLE IF NOT EXISTS reviews (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  uuid CHAR(36) NOT NULL,
  name VARCHAR(120) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  email VARCHAR(255) NULL,
  course_name VARCHAR(200) NULL,
  rating TINYINT UNSIGNED NOT NULL,
  review_message TEXT NOT NULL,
  status ENUM('PENDING', 'APPROVED', 'REJECTED', 'ARCHIVED') NOT NULL DEFAULT 'PENDING',
  featured TINYINT(1) NOT NULL DEFAULT 0,
  published TINYINT(1) NOT NULL DEFAULT 0,
  published_at TIMESTAMP NULL,
  admin_notes TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  approved_by_admin_id BIGINT NULL,
  ip_address VARCHAR(45) NULL,
  user_agent VARCHAR(512) NULL,
  CONSTRAINT fk_reviews_approved_by
    FOREIGN KEY (approved_by_admin_id) REFERENCES users(id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT chk_reviews_rating CHECK (rating BETWEEN 1 AND 5),
  UNIQUE KEY uq_reviews_uuid (uuid),
  KEY idx_reviews_status (status),
  KEY idx_reviews_featured (featured),
  KEY idx_reviews_published (published),
  KEY idx_reviews_created_at (created_at),
  KEY idx_reviews_published_list (published, status, featured, created_at DESC),
  KEY idx_reviews_phone_created (phone, created_at),
  KEY idx_reviews_ip_created (ip_address, created_at)
);

CREATE TABLE IF NOT EXISTS review_audit_log (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  review_id BIGINT NOT NULL,
  admin_id BIGINT NULL,
  admin_name VARCHAR(120) NULL,
  action VARCHAR(64) NOT NULL,
  previous_status VARCHAR(32) NULL,
  new_status VARCHAR(32) NULL,
  note TEXT NULL,
  metadata_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_review_audit_review
    FOREIGN KEY (review_id) REFERENCES reviews(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_review_audit_admin
    FOREIGN KEY (admin_id) REFERENCES users(id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  KEY idx_review_audit_review_created (review_id, created_at DESC),
  KEY idx_review_audit_action_created (action, created_at DESC)
);

CREATE TABLE IF NOT EXISTS student_questions (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  course_id BIGINT NULL,
  subject_id BIGINT NULL,
  assigned_teacher_id BIGINT NULL,
  subject VARCHAR(32) NOT NULL,
  title VARCHAR(220) NOT NULL,
  body TEXT NOT NULL,
  attachment_url VARCHAR(1000) NULL,
  audio_url VARCHAR(1000) NULL,
  answer TEXT NULL,
  answer_attachment_url VARCHAR(1000) NULL,
  answer_audio_url VARCHAR(1000) NULL,
  status ENUM('pending', 'answered') NOT NULL DEFAULT 'pending',
  seen_at TIMESTAMP NULL,
  teacher_pinned_at TIMESTAMP NULL,
  teacher_thread_ref VARCHAR(22) NULL,
  answered_by BIGINT NULL,
  answered_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_sq_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_sq_course_id FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_sq_subject_id FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_sq_assigned_teacher_id FOREIGN KEY (assigned_teacher_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_sq_answered_by FOREIGN KEY (answered_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
  KEY idx_sq_user_id (user_id),
  KEY idx_sq_status (status),
  KEY idx_sq_created_at (created_at),
  KEY idx_sq_updated_at (updated_at),
  KEY idx_sq_course_id (course_id),
  KEY idx_sq_subject_id (subject_id),
  KEY idx_sq_assigned_teacher_id (assigned_teacher_id),
  KEY idx_student_questions_user_created (user_id, created_at DESC),
  KEY idx_student_questions_status_subject (status, subject),
  KEY idx_sq_course_subject_status (course_id, subject_id, status),
  KEY idx_sq_teacher_inbox (assigned_teacher_id, status, updated_at),
  KEY idx_sq_teacher_thread_ref (assigned_teacher_id, teacher_thread_ref),
  KEY idx_sq_teacher_user_updated (assigned_teacher_id, user_id, updated_at)
);
-- Integrity migration: sql/migrations/student_questions_integrity_hardening.sql
-- Triggers (assigned_teacher role guard): applied via same migration on existing DBs

-- Teacher Q&A monitoring migration: sql/migrations/20250622_teacher_qa_monitoring.sql

CREATE TABLE IF NOT EXISTS teacher_answers (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  question_id BIGINT NOT NULL,
  teacher_id BIGINT NOT NULL,
  answer TEXT NOT NULL,
  answer_attachment_url VARCHAR(1000) NULL,
  answer_audio_url VARCHAR(1000) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_ta_question_id FOREIGN KEY (question_id) REFERENCES student_questions(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_ta_teacher_id FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  UNIQUE KEY uq_ta_question_id (question_id),
  KEY idx_ta_teacher_id (teacher_id),
  KEY idx_ta_teacher_created (teacher_id, created_at DESC),
  KEY idx_ta_question_created (question_id, created_at DESC)
);

CREATE TABLE IF NOT EXISTS teacher_activity_logs (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  teacher_id BIGINT NOT NULL,
  question_id BIGINT NULL,
  action_type ENUM('QUESTION_VIEWED', 'QUESTION_ANSWERED', 'ANSWER_UPDATED', 'LOGIN', 'LOGOUT') NOT NULL,
  metadata_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_tal_teacher_id FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_tal_question_id FOREIGN KEY (question_id) REFERENCES student_questions(id) ON DELETE SET NULL ON UPDATE CASCADE,
  KEY idx_tal_teacher_id (teacher_id),
  KEY idx_tal_action_type (action_type),
  KEY idx_tal_created_at (created_at),
  KEY idx_tal_teacher_action_created (teacher_id, action_type, created_at DESC),
  KEY idx_tal_question_id (question_id),
  KEY idx_tal_teacher_created (teacher_id, created_at DESC)
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
-- SEED DATA: DISTRICTS
-- =====================================================

INSERT INTO districts (province_id, name, slug, is_other_option, is_active, sort_order) VALUES
-- Punjab > Lahore Division (1)
(1, 'Lahore', 'lahore', FALSE, TRUE, 1),
(1, 'Sheikhupura', 'sheikhupura', FALSE, TRUE, 2),
(1, 'Nankana Sahib', 'nankana-sahib', FALSE, TRUE, 3),
(1, 'Kasur', 'kasur', FALSE, TRUE, 4),
-- Punjab > Rawalpindi Division (2)
(1, 'Rawalpindi', 'rawalpindi', FALSE, TRUE, 1),
(1, 'Attock', 'attock', FALSE, TRUE, 2),
(1, 'Chakwal', 'chakwal', FALSE, TRUE, 3),
(1, 'Jhelum', 'jhelum', FALSE, TRUE, 4),
-- Punjab > Faisalabad Division (3)
(1, 'Faisalabad', 'faisalabad', FALSE, TRUE, 1),
(1, 'Chiniot', 'chiniot', FALSE, TRUE, 2),
(1, 'Jhang', 'jhang', FALSE, TRUE, 3),
(1, 'Toba Tek Singh', 'toba-tek-singh', FALSE, TRUE, 4),
-- Punjab > Multan Division (4)
(1, 'Multan', 'multan', FALSE, TRUE, 1),
(1, 'Khanewal', 'khanewal', FALSE, TRUE, 2),
(1, 'Lodhran', 'lodhran', FALSE, TRUE, 3),
(1, 'Vehari', 'vehari', FALSE, TRUE, 4),
-- Punjab > Gujranwala Division (5)
(1, 'Gujranwala', 'gujranwala', FALSE, TRUE, 1),
(1, 'Gujrat', 'gujrat', FALSE, TRUE, 2),
(1, 'Hafizabad', 'hafizabad', FALSE, TRUE, 3),
(1, 'Mandi Bahauddin', 'mandi-bahauddin', FALSE, TRUE, 4),
(1, 'Narowal', 'narowal', FALSE, TRUE, 5),
(1, 'Sialkot', 'sialkot', FALSE, TRUE, 6),
-- Punjab > Sargodha Division (6)
(1, 'Sargodha', 'sargodha', FALSE, TRUE, 1),
(1, 'Bhakkar', 'bhakkar', FALSE, TRUE, 2),
(1, 'Khushab', 'khushab', FALSE, TRUE, 3),
(1, 'Mianwali', 'mianwali', FALSE, TRUE, 4),
-- Punjab > Bahawalpur Division (7)
(1, 'Bahawalpur', 'bahawalpur', FALSE, TRUE, 1),
(1, 'Bahawalnagar', 'bahawalnagar', FALSE, TRUE, 2),
(1, 'Rahim Yar Khan', 'rahim-yar-khan', FALSE, TRUE, 3),
-- Punjab > Sahiwal Division (8)
(1, 'Sahiwal', 'sahiwal', FALSE, TRUE, 1),
(1, 'Okara', 'okara', FALSE, TRUE, 2),
(1, 'Pakpattan', 'pakpattan', FALSE, TRUE, 3),
-- Punjab > DG Khan Division (9)
(1, 'DG Khan', 'dg-khan', FALSE, TRUE, 1),
(1, 'Layyah', 'layyah', FALSE, TRUE, 2),
(1, 'Muzaffargarh', 'muzaffargarh', FALSE, TRUE, 3),
(1, 'Rajanpur', 'rajanpur', FALSE, TRUE, 4),
-- Punjab > Gujrat Division (10)
(1, 'Gujrat', 'gujrat-d', FALSE, TRUE, 1),
(1, 'Kharian', 'kharian', FALSE, TRUE, 2),
-- Sindh > Karachi Division (11)
(2, 'Karachi East', 'karachi-east', FALSE, TRUE, 1),
(2, 'Karachi West', 'karachi-west', FALSE, TRUE, 2),
(2, 'Karachi Central', 'karachi-central', FALSE, TRUE, 3),
(2, 'Karachi South', 'karachi-south', FALSE, TRUE, 4),
(2, 'Malir', 'malir', FALSE, TRUE, 5),
(2, 'Korangi', 'korangi', FALSE, TRUE, 6),
-- Sindh > Hyderabad Division (12)
(2, 'Hyderabad', 'hyderabad', FALSE, TRUE, 1),
(2, 'Jamshoro', 'jamshoro', FALSE, TRUE, 2),
(2, 'Matiari', 'matiari', FALSE, TRUE, 3),
(2, 'Tando Allahyar', 'tando-allahyar', FALSE, TRUE, 4),
(2, 'Tando Muhammad Khan', 'tando-muhammad-khan', FALSE, TRUE, 5),
-- Sindh > Sukkur Division (13)
(2, 'Sukkur', 'sukkur', FALSE, TRUE, 1),
(2, 'Ghotki', 'ghotki', FALSE, TRUE, 2),
(2, 'Khairpur', 'khairpur', FALSE, TRUE, 3),
-- Sindh > Larkana Division (14)
(2, 'Larkana', 'larkana', FALSE, TRUE, 1),
(2, 'Jacobabad', 'jacobabad', FALSE, TRUE, 2),
(2, 'Kashmore', 'kashmore', FALSE, TRUE, 3),
(2, 'Shikarpur', 'shikarpur', FALSE, TRUE, 4),
-- Sindh > Mirpurkhas Division (15)
(2, 'Mirpurkhas', 'mirpurkhas', FALSE, TRUE, 1),
(2, 'Tharparkar', 'tharparkar', FALSE, TRUE, 2),
(2, 'Umerkot', 'umerkot', FALSE, TRUE, 3),
-- Sindh > Shaheed Benazirabad Division (16)
(2, 'Shaheed Benazirabad', 'shaheed-benazirabad', FALSE, TRUE, 1),
(2, 'Naushahro Feroze', 'naushahro-feroze', FALSE, TRUE, 2),
(2, 'Sanghar', 'sanghar', FALSE, TRUE, 3),
-- KPK > Peshawar Division (17)
(3, 'Peshawar', 'peshawar', FALSE, TRUE, 1),
(3, 'Charsadda', 'charsadda', FALSE, TRUE, 2),
(3, 'Nowshera', 'nowshera', FALSE, TRUE, 3),
-- KPK > Mardan Division (18)
(3, 'Mardan', 'mardan', FALSE, TRUE, 1),
(3, 'Swabi', 'swabi', FALSE, TRUE, 2),
-- KPK > Malakand Division (19)
(3, 'Malakand', 'malakand', FALSE, TRUE, 1),
(3, 'Swat', 'swat', FALSE, TRUE, 2),
(3, 'Dir Lower', 'dir-lower', FALSE, TRUE, 3),
(3, 'Dir Upper', 'dir-upper', FALSE, TRUE, 4),
(3, 'Chitral', 'chitral', FALSE, TRUE, 5),
(3, 'Buner', 'buner', FALSE, TRUE, 6),
(3, 'Shangla', 'shangla', FALSE, TRUE, 7),
-- KPK > Hazara Division (20)
(3, 'Abbottabad', 'abbottabad', FALSE, TRUE, 1),
(3, 'Mansehra', 'mansehra', FALSE, TRUE, 2),
(3, 'Haripur', 'haripur', FALSE, TRUE, 3),
(3, 'Battagram', 'battagram', FALSE, TRUE, 4),
(3, 'Kohistan', 'kohistan', FALSE, TRUE, 5),
-- KPK > Kohat Division (21)
(3, 'Kohat', 'kohat', FALSE, TRUE, 1),
(3, 'Karak', 'karak', FALSE, TRUE, 2),
(3, 'Hangu', 'hangu', FALSE, TRUE, 3),
-- KPK > Bannu Division (22)
(3, 'Bannu', 'bannu', FALSE, TRUE, 1),
(3, 'Lakki Marwat', 'lakki-marwat', FALSE, TRUE, 2),
(3, 'North Waziristan', 'north-waziristan', FALSE, TRUE, 3),
-- KPK > DI Khan Division (23)
(3, 'Dera Ismail Khan', 'dera-ismail-khan', FALSE, TRUE, 1),
(3, 'South Waziristan', 'south-waziristan', FALSE, TRUE, 2),
(3, 'Tank', 'tank', FALSE, TRUE, 3),
-- Balochistan > Quetta Division (24)
(4, 'Quetta', 'quetta', FALSE, TRUE, 1),
(4, 'Pishin', 'pishin', FALSE, TRUE, 2),
(4, 'Killa Abdullah', 'killa-abdullah', FALSE, TRUE, 3),
(4, 'Chagai', 'chagai', FALSE, TRUE, 4),
-- Balochistan > Kalat Division (25)
(4, 'Kalat', 'kalat', FALSE, TRUE, 1),
(4, 'Khuzdar', 'khuzdar', FALSE, TRUE, 2),
(4, 'Mastung', 'mastung', FALSE, TRUE, 3),
-- Balochistan > Makran Division (26)
(4, 'Gwadar', 'gwadar', FALSE, TRUE, 1),
(4, 'Turbat', 'turbat', FALSE, TRUE, 2),
(4, 'Panjgur', 'panjgur', FALSE, TRUE, 3),
-- Balochistan > Zhob Division (27)
(4, 'Zhob', 'zhob', FALSE, TRUE, 1),
(4, 'Sherani', 'sherani', FALSE, TRUE, 2),
(4, 'Musakhel', 'musakhel', FALSE, TRUE, 3),
-- Balochistan > Nasirabad Division (28)
(4, 'Nasirabad', 'nasirabad', FALSE, TRUE, 1),
(4, 'Jaffarabad', 'jaffarabad', FALSE, TRUE, 2),
(4, 'Sohbatpur', 'sohbatpur', FALSE, TRUE, 3),
-- Balochistan > Sibi Division (29)
(4, 'Sibi', 'sibi', FALSE, TRUE, 1),
(4, 'Ziarat', 'ziarat', FALSE, TRUE, 2),
(4, 'Harnai', 'harnai', FALSE, TRUE, 3),
-- ICT > Islamabad Division (30)
(5, 'Islamabad', 'islamabad', FALSE, TRUE, 1),
-- AJK > Muzaffarabad Division (31)
(6, 'Muzaffarabad', 'muzaffarabad', FALSE, TRUE, 1),
(6, 'Neelum', 'neelum', FALSE, TRUE, 2),
-- AJK > Mirpur Division (32)
(6, 'Mirpur', 'mirpur', FALSE, TRUE, 1),
(6, 'Bhimber', 'bhimber', FALSE, TRUE, 2),
(6, 'Kotli', 'kotli', FALSE, TRUE, 3),
-- AJK > Poonch Division (33)
(6, 'Poonch', 'poonch', FALSE, TRUE, 1),
(6, 'Haveli', 'haveli', FALSE, TRUE, 2),
(6, 'Bagh', 'bagh', FALSE, TRUE, 3),
(6, 'Sudhnoti', 'sudhnoti', FALSE, TRUE, 4),
-- GB > Gilgit Division (34)
(7, 'Gilgit', 'gilgit', FALSE, TRUE, 1),
(7, 'Hunza', 'hunza', FALSE, TRUE, 2),
(7, 'Nagar', 'nagar', FALSE, TRUE, 3),
-- GB > Baltistan Division (35)
(7, 'Skardu', 'skardu', FALSE, TRUE, 1),
(7, 'Shigar', 'shigar', FALSE, TRUE, 2),
(7, 'Kharmang', 'kharmang', FALSE, TRUE, 3),
(7, 'Roundu', 'roundu', FALSE, TRUE, 4),
-- GB > Diamer Division (36)
(7, 'Diamer', 'diamer', FALSE, TRUE, 1),
(7, 'Darel', 'darel', FALSE, TRUE, 2),
(7, 'Tangir', 'tangir', FALSE, TRUE, 3);

-- =====================================================
-- SEED DATA: CITIES (major cities per district)
-- =====================================================

INSERT INTO cities (province_id, district_id, name, slug, is_other_option, is_active, sort_order) VALUES
-- Punjab > Lahore > Lahore (1)
(1, 1, 'Lahore', 'lahore', FALSE, TRUE, 1),
(1, 1, 'Bahria Town Lahore', 'bahria-town-lahore', FALSE, TRUE, 2),
(1, 1, 'DHA Lahore', 'dha-lahore', FALSE, TRUE, 3),
-- Punjab > Lahore > Sheikhupura (2)
(1, 2, 'Sheikhupura', 'sheikhupura', FALSE, TRUE, 1),
(1, 2, 'Muridke', 'muridke', FALSE, TRUE, 2),
-- Punjab > Lahore > Nankana Sahib (3)
(1, 3, 'Nankana Sahib', 'nankana-sahib', FALSE, TRUE, 1),
-- Punjab > Lahore > Kasur (4)
(1, 4, 'Kasur', 'kasur', FALSE, TRUE, 1),
(1, 4, 'Chunian', 'chunian', FALSE, TRUE, 2),
-- Punjab > Rawalpindi > Rawalpindi (5)
(1, 5, 'Rawalpindi', 'rawalpindi', FALSE, TRUE, 1),
(1, 5, 'Bahria Town Rawalpindi', 'bahria-town-rawalpindi', FALSE, TRUE, 2),
(1, 5, 'Murree', 'murree', FALSE, TRUE, 3),
-- Punjab > Rawalpindi > Attock (6)
(1, 6, 'Attock', 'attock', FALSE, TRUE, 1),
(1, 6, 'Hazro', 'hazro', FALSE, TRUE, 2),
-- Punjab > Rawalpindi > Chakwal (7)
(1, 7, 'Chakwal', 'chakwal', FALSE, TRUE, 1),
-- Punjab > Rawalpindi > Jhelum (8)
(1, 8, 'Jhelum', 'jhelum', FALSE, TRUE, 1),
(1, 8, 'Sohawa', 'sohawa', FALSE, TRUE, 2),
-- Punjab > Faisalabad > Faisalabad (9)
(1, 9, 'Faisalabad', 'faisalabad', FALSE, TRUE, 1),
(1, 9, 'Jaranwala', 'jaranwala', FALSE, TRUE, 2),
(1, 9, 'Samundri', 'samundri', FALSE, TRUE, 3),
-- Punjab > Faisalabad > Chiniot (10)
(1, 10, 'Chiniot', 'chiniot', FALSE, TRUE, 1),
-- Punjab > Faisalabad > Jhang (11)
(1, 11, 'Jhang', 'jhang', FALSE, TRUE, 1),
(1, 11, 'Shorkot', 'shorkot', FALSE, TRUE, 2),
-- Punjab > Faisalabad > Toba Tek Singh (12)
(1, 12, 'Toba Tek Singh', 'toba-tek-singh', FALSE, TRUE, 1),
(1, 12, 'Gojra', 'gojra', FALSE, TRUE, 2),
-- Punjab > Multan > Multan (13)
(1, 13, 'Multan', 'multan', FALSE, TRUE, 1),
(1, 13, 'Shujabad', 'shujabad', FALSE, TRUE, 2),
-- Punjab > Multan > Khanewal (14)
(1, 14, 'Khanewal', 'khanewal', FALSE, TRUE, 1),
(1, 14, 'Mian Channu', 'mian-channu', FALSE, TRUE, 2),
-- Punjab > Multan > Lodhran (15)
(1, 15, 'Lodhran', 'lodhran', FALSE, TRUE, 1),
-- Punjab > Multan > Vehari (16)
(1, 16, 'Vehari', 'vehari', FALSE, TRUE, 1),
(1, 16, 'Burewala', 'burewala', FALSE, TRUE, 2),
-- Punjab > Gujranwala > Gujranwala (17)
(1, 17, 'Gujranwala', 'gujranwala', FALSE, TRUE, 1),
(1, 17, 'Kamoke', 'kamoke', FALSE, TRUE, 2),
-- Punjab > Gujranwala > Sialkot (22)
(1, 22, 'Sialkot', 'sialkot', FALSE, TRUE, 1),
(1, 22, 'Daska', 'daska', FALSE, TRUE, 2),
(1, 22, 'Wazirabad', 'wazirabad', FALSE, TRUE, 3),
-- Punjab > Sargodha > Sargodha (23)
(1, 23, 'Sargodha', 'sargodha', FALSE, TRUE, 1),
(1, 23, 'Bhalwal', 'bhalwal', FALSE, TRUE, 2),
-- Punjab > Bahawalpur > Bahawalpur (27)
(1, 27, 'Bahawalpur', 'bahawalpur', FALSE, TRUE, 1),
(1, 27, 'Ahmadpur East', 'ahmadpur-east', FALSE, TRUE, 2),
-- Punjab > Bahawalpur > Rahim Yar Khan (29)
(1, 29, 'Rahim Yar Khan', 'rahim-yar-khan', FALSE, TRUE, 1),
(1, 29, 'Sadiqabad', 'sadiqabad', FALSE, TRUE, 2),
-- Sindh > Karachi > Karachi South (44)
(2, 44, 'Karachi', 'karachi', FALSE, TRUE, 1),
(2, 44, 'Clifton', 'clifton', FALSE, TRUE, 2),
(2, 44, 'Saddar', 'saddar', FALSE, TRUE, 3),
-- Sindh > Karachi > Karachi East (41)
(2, 41, 'Gulshan-e-Iqbal', 'gulshan-e-iqbal', FALSE, TRUE, 1),
(2, 41, 'Gulberg', 'gulberg', FALSE, TRUE, 2),
(2, 41, 'North Nazimabad', 'north-nazimabad', FALSE, TRUE, 3),
-- Sindh > Karachi > Malir (45)
(2, 45, 'Malir', 'malir', FALSE, TRUE, 1),
(2, 45, 'Bin Qasim', 'bin-qasim', FALSE, TRUE, 2),
-- Sindh > Hyderabad > Hyderabad (47)
(2, 47, 'Hyderabad', 'hyderabad', FALSE, TRUE, 1),
(2, 47, 'Qasimabad', 'qasimabad', FALSE, TRUE, 2),
(2, 47, 'Latifabad', 'latifabad', FALSE, TRUE, 3),
-- Sindh > Sukkur > Sukkur (51)
(2, 51, 'Sukkur', 'sukkur', FALSE, TRUE, 1),
-- Sindh > Sukkur > Khairpur (53)
(2, 53, 'Khairpur', 'khairpur', FALSE, TRUE, 1),
(2, 53, 'Kingri', 'kingri', FALSE, TRUE, 2),
-- Sindh > Larkana > Larkana (54)
(2, 54, 'Larkana', 'larkana', FALSE, TRUE, 1),
-- Sindh > Larkana > Jacobabad (55)
(2, 55, 'Jacobabad', 'jacobabad', FALSE, TRUE, 1),
-- Sindh > Larkana > Shikarpur (57)
(2, 57, 'Shikarpur', 'shikarpur', FALSE, TRUE, 1),
-- KPK > Peshawar > Peshawar (67)
(3, 67, 'Peshawar', 'peshawar', FALSE, TRUE, 1),
(3, 67, 'Hayatabad', 'hayatabad', FALSE, TRUE, 2),
(3, 67, 'University Town', 'university-town', FALSE, TRUE, 3),
-- KPK > Peshawar > Charsadda (68)
(3, 68, 'Charsadda', 'charsadda', FALSE, TRUE, 1),
-- KPK > Peshawar > Nowshera (69)
(3, 69, 'Nowshera', 'nowshera', FALSE, TRUE, 1),
-- KPK > Hazara > Abbottabad (77)
(3, 77, 'Abbottabad', 'abbottabad', FALSE, TRUE, 1),
(3, 77, 'Havelian', 'havelian', FALSE, TRUE, 2),
-- KPK > Hazara > Mansehra (78)
(3, 78, 'Mansehra', 'mansehra', FALSE, TRUE, 1),
-- KPK > Hazara > Haripur (79)
(3, 79, 'Haripur', 'haripur', FALSE, TRUE, 1),
-- KPK > Swat (71)
(3, 71, 'Swat', 'swat', FALSE, TRUE, 1),
(3, 71, 'Mingora', 'mingora', FALSE, TRUE, 2),
-- Balochistan > Quetta > Quetta (101)
(4, 101, 'Quetta', 'quetta', FALSE, TRUE, 1),
(4, 101, 'Satellite Town Quetta', 'satellite-town-quetta', FALSE, TRUE, 2),
-- Balochistan > Makran > Gwadar (107)
(4, 107, 'Gwadar', 'gwadar', FALSE, TRUE, 1),
-- ICT > Islamabad (116)
(5, 116, 'Islamabad', 'islamabad', FALSE, TRUE, 1),
(5, 116, 'F-6', 'f-6', FALSE, TRUE, 2),
(5, 116, 'F-7', 'f-7', FALSE, TRUE, 3),
(5, 116, 'F-8', 'f-8', FALSE, TRUE, 4),
(5, 116, 'G-9', 'g-9', FALSE, TRUE, 5),
(5, 116, 'G-10', 'g-10', FALSE, TRUE, 6),
(5, 116, 'G-11', 'g-11', FALSE, TRUE, 7),
(5, 116, 'Bahria Town Islamabad', 'bahria-town-islamabad', FALSE, TRUE, 8),
(5, 116, 'DHA Islamabad', 'dha-islamabad', FALSE, TRUE, 9),
-- AJK > Muzaffarabad (117)
(6, 117, 'Muzaffarabad', 'muzaffarabad', FALSE, TRUE, 1),
-- AJK > Mirpur (119)
(6, 119, 'Mirpur', 'mirpur', FALSE, TRUE, 1),
(6, 119, 'New Mirpur City', 'new-mirpur-city', FALSE, TRUE, 2),
-- GB > Gilgit (125)
(7, 125, 'Gilgit', 'gilgit', FALSE, TRUE, 1),
-- GB > Baltistan > Skardu (128)
(7, 128, 'Skardu', 'skardu', FALSE, TRUE, 1);

-- =====================================================

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

-- Tests type/category/subjects refactor (idempotent)
UPDATE tests SET category = 'MDCAT' WHERE category IS NULL OR TRIM(category) = '';

UPDATE tests
SET test_type = 'mixed_subject'
WHERE test_type IS NULL
   OR TRIM(test_type) = ''
   OR test_type NOT IN ('subject_wise', 'mixed_subject');

SET @tests_sub_cat_col := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'tests' AND COLUMN_NAME = 'sub_category'
);
SET @sql_tests_drop_sub_cat := IF(
  @tests_sub_cat_col = 0,
  'SELECT 1',
  'ALTER TABLE tests DROP COLUMN sub_category'
);
PREPARE stmt_tests_drop_sub_cat FROM @sql_tests_drop_sub_cat;
EXECUTE stmt_tests_drop_sub_cat;
DEALLOCATE PREPARE stmt_tests_drop_sub_cat;

SET @tests_tbl_refactor := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'tests'
);
SET @sql_tests_category_default := IF(
  @tests_tbl_refactor = 0,
  'SELECT 1',
  'ALTER TABLE tests MODIFY COLUMN category VARCHAR(80) NOT NULL DEFAULT ''MDCAT'''
);
PREPARE stmt_tests_category_default FROM @sql_tests_category_default;
EXECUTE stmt_tests_category_default;
DEALLOCATE PREPARE stmt_tests_category_default;

SET @sql_tests_type_default := IF(
  @tests_tbl_refactor = 0,
  'SELECT 1',
  'ALTER TABLE tests MODIFY COLUMN test_type VARCHAR(50) NOT NULL DEFAULT ''subject_wise'''
);
PREPARE stmt_tests_type_default FROM @sql_tests_type_default;
EXECUTE stmt_tests_type_default;
DEALLOCATE PREPARE stmt_tests_type_default;

CREATE TABLE IF NOT EXISTS test_subjects (
  test_id BIGINT NOT NULL,
  subject_id BIGINT NOT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (test_id, subject_id),
  KEY idx_test_subjects_subject (subject_id),
  CONSTRAINT fk_test_subjects_test FOREIGN KEY (test_id) REFERENCES tests(id) ON DELETE CASCADE,
  CONSTRAINT fk_test_subjects_subject FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- P2 PATCH-6: drop legacy tests.subject VARCHAR (idempotent; run audit-test-subject-legacy.mjs first)
SET @tests_legacy_subject_col := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'tests' AND COLUMN_NAME = 'subject'
);
SET @sql_drop_tests_legacy_subject := IF(
  @tests_legacy_subject_col = 0,
  'SELECT 1',
  'ALTER TABLE tests DROP COLUMN subject'
);
PREPARE stmt_drop_tests_legacy_subject FROM @sql_drop_tests_legacy_subject;
EXECUTE stmt_drop_tests_legacy_subject;
DEALLOCATE PREPARE stmt_drop_tests_legacy_subject;

-- P2 PATCH-7: strict enum CHECK constraints (after normalization above)
SET @chk_tests_type_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'tests' AND CONSTRAINT_NAME = 'chk_tests_test_type' AND CONSTRAINT_TYPE = 'CHECK'
);
SET @sql_add_chk_tests_type := IF(
  @tests_tbl_refactor = 0,
  'SELECT 1',
  IF(
    @chk_tests_type_exists > 0,
    'SELECT 1',
    'ALTER TABLE tests ADD CONSTRAINT chk_tests_test_type CHECK (test_type IN (''subject_wise'', ''mixed_subject''))'
  )
);
PREPARE stmt_add_chk_tests_type FROM @sql_add_chk_tests_type;
EXECUTE stmt_add_chk_tests_type;
DEALLOCATE PREPARE stmt_add_chk_tests_type;

SET @chk_tests_category_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'tests' AND CONSTRAINT_NAME = 'chk_tests_category' AND CONSTRAINT_TYPE = 'CHECK'
);
SET @sql_add_chk_tests_category := IF(
  @tests_tbl_refactor = 0,
  'SELECT 1',
  IF(
    @chk_tests_category_exists > 0,
    'SELECT 1',
    'ALTER TABLE tests ADD CONSTRAINT chk_tests_category CHECK (category = ''MDCAT'')'
  )
);
PREPARE stmt_add_chk_tests_category FROM @sql_add_chk_tests_category;
EXECUTE stmt_add_chk_tests_category;
DEALLOCATE PREPARE stmt_add_chk_tests_category;

SET @chk_tests_status_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'tests' AND CONSTRAINT_NAME = 'chk_tests_status' AND CONSTRAINT_TYPE = 'CHECK'
);
SET @sql_add_chk_tests_status := IF(
  @tests_tbl_refactor = 0,
  'SELECT 1',
  IF(
    @chk_tests_status_exists > 0,
    'SELECT 1',
    'ALTER TABLE tests ADD CONSTRAINT chk_tests_status CHECK (status IN (''INCOMPLETE'', ''DRAFT'', ''READY_FOR_PUBLISH'', ''published''))'
  )
);
PREPARE stmt_add_chk_tests_status FROM @sql_add_chk_tests_status;
EXECUTE stmt_add_chk_tests_status;
DEALLOCATE PREPARE stmt_add_chk_tests_status;

-- LMS: test_attempts.completion_reason (why an attempt ended)
-- Up:       sql/migrations/test_attempts_completion_reason.sql
-- Rollback: sql/migrations/test_attempts_completion_reason_rollback.sql
-- Node:     src/db/ensureTestsApplicationSchema.js
SET @ta_tbl := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'test_attempts'
);
SET @ta_completion_reason_col := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'test_attempts' AND COLUMN_NAME = 'completion_reason'
);
SET @sql_ta_add_completion_reason := IF(
  @ta_tbl = 0 OR @ta_completion_reason_col > 0,
  'SELECT 1',
  'ALTER TABLE test_attempts ADD COLUMN completion_reason VARCHAR(50) NULL AFTER submitted_at'
);
PREPARE stmt_ta_add_completion_reason FROM @sql_ta_add_completion_reason;
EXECUTE stmt_ta_add_completion_reason;
DEALLOCATE PREPARE stmt_ta_add_completion_reason;

-- LMS: test_quiz_drafts (Quiz Builder server-side draft persistence)
-- Up:       sql/migrations/test_quiz_drafts.sql
-- Rollback: sql/migrations/test_quiz_drafts_rollback.sql
-- Node:     src/db/ensureTestQuizDraftsSchema.js
SET @tqd_tbl := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'test_quiz_drafts'
);
SET @sql_create_tqd := IF(
  @tqd_tbl > 0,
  'SELECT 1',
  'CREATE TABLE test_quiz_drafts (
    draft_id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    test_id BIGINT NOT NULL,
    draft_payload JSON NOT NULL,
    version INT UNSIGNED NOT NULL DEFAULT 1,
    created_by BIGINT NOT NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP NULL DEFAULT NULL,
    deleted_by BIGINT NULL,
    UNIQUE KEY uq_test_quiz_drafts_test_id (test_id),
    KEY idx_test_quiz_drafts_created_by (created_by),
    KEY idx_test_quiz_drafts_updated_at (updated_at),
    KEY idx_test_quiz_drafts_deleted_at (deleted_at),
    CONSTRAINT fk_tqd_test FOREIGN KEY (test_id) REFERENCES tests(id) ON DELETE CASCADE,
    CONSTRAINT fk_tqd_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_tqd_deleted_by FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT chk_tqd_version_positive CHECK (version >= 1)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
);
PREPARE stmt_create_tqd FROM @sql_create_tqd;
EXECUTE stmt_create_tqd;
DEALLOCATE PREPARE stmt_create_tqd;

-- LMS: test_quiz_drafts soft-delete columns
-- Up:       sql/migrations/test_quiz_drafts_soft_delete.sql
-- Rollback: sql/migrations/test_quiz_drafts_soft_delete_rollback.sql
SET @tqd_deleted_at_col := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'test_quiz_drafts' AND COLUMN_NAME = 'deleted_at'
);
SET @sql_tqd_add_deleted_at := IF(
  @tqd_tbl = 0 OR @tqd_deleted_at_col > 0,
  'SELECT 1',
  'ALTER TABLE test_quiz_drafts ADD COLUMN deleted_at TIMESTAMP NULL DEFAULT NULL AFTER updated_at'
);
PREPARE stmt_tqd_add_deleted_at FROM @sql_tqd_add_deleted_at;
EXECUTE stmt_tqd_add_deleted_at;
DEALLOCATE PREPARE stmt_tqd_add_deleted_at;

SET @tqd_deleted_by_col := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'test_quiz_drafts' AND COLUMN_NAME = 'deleted_by'
);
SET @sql_tqd_add_deleted_by := IF(
  @tqd_tbl = 0 OR @tqd_deleted_by_col > 0,
  'SELECT 1',
  'ALTER TABLE test_quiz_drafts ADD COLUMN deleted_by BIGINT NULL AFTER deleted_at'
);
PREPARE stmt_tqd_add_deleted_by FROM @sql_tqd_add_deleted_by;
EXECUTE stmt_tqd_add_deleted_by;
DEALLOCATE PREPARE stmt_tqd_add_deleted_by;


