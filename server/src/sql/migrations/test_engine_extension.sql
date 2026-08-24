-- =============================================================================
-- MRB LMS — test engine extension (sections, layout, score bands, anti-cheat)
-- =============================================================================
-- PRODUCTION-CRITICAL | ADDITIVE ONLY | IDEMPOTENT | ZERO DATA LOSS
--
-- Extends MCQ test engine with optional sections, display/layout settings,
-- score-based feedback bands, question tips, and cheating violation tracking.
-- Existing MCQ tests and rows are unaffected (nullable columns + safe defaults).
--
-- Rollback companion: test_engine_extension_rollback.sql
-- Node bootstrap:      src/db/ensureTestEngineExtensionSchema.js
--
-- Run:
--   mysql -u USER -p DATABASE_NAME < test_engine_extension.sql
-- =============================================================================

SET @db := DATABASE();

SET @tests_tbl := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'tests'
);

SET @test_questions_tbl := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'test_questions'
);

SET @question_bank_tbl := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'question_bank'
);

SET @test_attempts_tbl := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'test_attempts'
);

-- ---------------------------------------------------------------------------
-- 1. test_sections
-- ---------------------------------------------------------------------------
SET @test_sections_tbl := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'test_sections'
);

SET @sql_create_test_sections := IF(
  @tests_tbl = 0,
  'SELECT ''SKIP: tests table missing'' AS migration_skip',
  IF(
    @test_sections_tbl > 0,
    'SELECT ''SKIP: test_sections already exists'' AS migration_skip',
    'CREATE TABLE test_sections (
      id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      test_id BIGINT NOT NULL,
      display_order INT NOT NULL DEFAULT 0,
      subject_label VARCHAR(255) NOT NULL,
      divider_content_html LONGTEXT NULL,
      created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_test_sections_test_id (test_id),
      KEY idx_test_sections_test_order (test_id, display_order),
      CONSTRAINT fk_ts_test FOREIGN KEY (test_id) REFERENCES tests(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
  )
);

PREPARE stmt_create_test_sections FROM @sql_create_test_sections;
EXECUTE stmt_create_test_sections;
DEALLOCATE PREPARE stmt_create_test_sections;

SET @test_sections_subject_id_col := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'test_sections' AND COLUMN_NAME = 'subject_id'
);
SET @sql_add_section_subject_id := IF(
  @test_sections_tbl = 0,
  'SELECT ''SKIP: test_sections missing'' AS migration_skip',
  IF(
    @test_sections_subject_id_col > 0,
    'SELECT ''SKIP: test_sections.subject_id exists'' AS migration_skip',
    'ALTER TABLE test_sections ADD COLUMN subject_id BIGINT NULL AFTER subject_label'
  )
);
PREPARE stmt_add_section_subject_id FROM @sql_add_section_subject_id;
EXECUTE stmt_add_section_subject_id;
DEALLOCATE PREPARE stmt_add_section_subject_id;

-- ---------------------------------------------------------------------------
-- 2. tests — layout_mode, display_mode, results_released_at, full_page_mode
-- ---------------------------------------------------------------------------
SET @tests_layout_mode_col := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'tests' AND COLUMN_NAME = 'layout_mode'
);
SET @sql_tests_add_layout_mode := IF(
  @tests_tbl = 0 OR @tests_layout_mode_col > 0,
  'SELECT 1',
  'ALTER TABLE tests ADD COLUMN layout_mode ENUM(''vertical'', ''horizontal'') NOT NULL DEFAULT ''vertical'' AFTER end_date'
);
PREPARE stmt_tests_add_layout_mode FROM @sql_tests_add_layout_mode;
EXECUTE stmt_tests_add_layout_mode;
DEALLOCATE PREPARE stmt_tests_add_layout_mode;

SET @tests_display_mode_col := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'tests' AND COLUMN_NAME = 'display_mode'
);
SET @sql_tests_add_display_mode := IF(
  @tests_tbl = 0 OR @tests_display_mode_col > 0,
  'SELECT 1',
  'ALTER TABLE tests ADD COLUMN display_mode ENUM(''all'', ''one_per_page'') NOT NULL DEFAULT ''all'' AFTER layout_mode'
);
PREPARE stmt_tests_add_display_mode FROM @sql_tests_add_display_mode;
EXECUTE stmt_tests_add_display_mode;
DEALLOCATE PREPARE stmt_tests_add_display_mode;

SET @tests_results_released_at_col := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'tests' AND COLUMN_NAME = 'results_released_at'
);
SET @sql_tests_add_results_released_at := IF(
  @tests_tbl = 0 OR @tests_results_released_at_col > 0,
  'SELECT 1',
  'ALTER TABLE tests ADD COLUMN results_released_at DATETIME NULL COMMENT ''When set, students may view results even if show_result_immediately was off at submit time; NULL means use show_result_immediately only'' AFTER display_mode'
);
PREPARE stmt_tests_add_results_released_at FROM @sql_tests_add_results_released_at;
EXECUTE stmt_tests_add_results_released_at;
DEALLOCATE PREPARE stmt_tests_add_results_released_at;

SET @tests_full_page_mode_col := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'tests' AND COLUMN_NAME = 'full_page_mode'
);
SET @sql_tests_add_full_page_mode := IF(
  @tests_tbl = 0 OR @tests_full_page_mode_col > 0,
  'SELECT 1',
  'ALTER TABLE tests ADD COLUMN full_page_mode TINYINT(1) NOT NULL DEFAULT 0 AFTER results_released_at'
);
PREPARE stmt_tests_add_full_page_mode FROM @sql_tests_add_full_page_mode;
EXECUTE stmt_tests_add_full_page_mode;
DEALLOCATE PREPARE stmt_tests_add_full_page_mode;

SET @tests_results_released_idx := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'tests' AND INDEX_NAME = 'idx_tests_results_released_at'
);
SET @sql_tests_add_results_released_idx := IF(
  @tests_tbl = 0 OR @tests_results_released_idx > 0,
  'SELECT 1',
  'ALTER TABLE tests ADD KEY idx_tests_results_released_at (results_released_at)'
);
PREPARE stmt_tests_add_results_released_idx FROM @sql_tests_add_results_released_idx;
EXECUTE stmt_tests_add_results_released_idx;
DEALLOCATE PREPARE stmt_tests_add_results_released_idx;

-- ---------------------------------------------------------------------------
-- 3. question_bank — tip_html
-- ---------------------------------------------------------------------------
SET @qb_tip_html_col := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'question_bank' AND COLUMN_NAME = 'tip_html'
);
SET @sql_qb_add_tip_html := IF(
  @question_bank_tbl = 0 OR @qb_tip_html_col > 0,
  'SELECT 1',
  'ALTER TABLE question_bank ADD COLUMN tip_html LONGTEXT NULL AFTER explanation_html'
);
PREPARE stmt_qb_add_tip_html FROM @sql_qb_add_tip_html;
EXECUTE stmt_qb_add_tip_html;
DEALLOCATE PREPARE stmt_qb_add_tip_html;

-- ---------------------------------------------------------------------------
-- 4. test_questions — section_id (nullable FK)
-- ---------------------------------------------------------------------------
SET @tq_section_id_col := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'test_questions' AND COLUMN_NAME = 'section_id'
);
SET @sql_tq_add_section_id := IF(
  @test_questions_tbl = 0 OR @tq_section_id_col > 0,
  'SELECT 1',
  'ALTER TABLE test_questions ADD COLUMN section_id BIGINT NULL AFTER display_order'
);
PREPARE stmt_tq_add_section_id FROM @sql_tq_add_section_id;
EXECUTE stmt_tq_add_section_id;
DEALLOCATE PREPARE stmt_tq_add_section_id;

SET @tq_section_idx := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'test_questions' AND INDEX_NAME = 'idx_test_questions_section_id'
);
SET @sql_tq_add_section_idx := IF(
  @test_questions_tbl = 0 OR @tq_section_idx > 0,
  'SELECT 1',
  'ALTER TABLE test_questions ADD KEY idx_test_questions_section_id (section_id)'
);
PREPARE stmt_tq_add_section_idx FROM @sql_tq_add_section_idx;
EXECUTE stmt_tq_add_section_idx;
DEALLOCATE PREPARE stmt_tq_add_section_idx;

SET @fk_tq_section_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'test_questions' AND CONSTRAINT_NAME = 'fk_tq_section' AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);
SET @test_sections_tbl_after := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'test_sections'
);
SET @sql_tq_add_section_fk := IF(
  @test_questions_tbl = 0 OR @test_sections_tbl_after = 0 OR @fk_tq_section_exists > 0,
  'SELECT 1',
  'ALTER TABLE test_questions ADD CONSTRAINT fk_tq_section FOREIGN KEY (section_id) REFERENCES test_sections(id) ON DELETE SET NULL'
);
PREPARE stmt_tq_add_section_fk FROM @sql_tq_add_section_fk;
EXECUTE stmt_tq_add_section_fk;
DEALLOCATE PREPARE stmt_tq_add_section_fk;

-- ---------------------------------------------------------------------------
-- 5. test_score_bands
-- ---------------------------------------------------------------------------
SET @test_score_bands_tbl := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'test_score_bands'
);

SET @sql_create_test_score_bands := IF(
  @tests_tbl = 0,
  'SELECT ''SKIP: tests table missing'' AS migration_skip',
  IF(
    @test_score_bands_tbl > 0,
    'SELECT ''SKIP: test_score_bands already exists'' AS migration_skip',
    'CREATE TABLE test_score_bands (
      id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      test_id BIGINT NOT NULL,
      min_score DECIMAL(8,2) NOT NULL,
      max_score DECIMAL(8,2) NOT NULL,
      message_html LONGTEXT NOT NULL,
      display_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_test_score_bands_test_id (test_id),
      KEY idx_test_score_bands_test_order (test_id, display_order),
      CONSTRAINT fk_tsb_test FOREIGN KEY (test_id) REFERENCES tests(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
  )
);

PREPARE stmt_create_test_score_bands FROM @sql_create_test_score_bands;
EXECUTE stmt_create_test_score_bands;
DEALLOCATE PREPARE stmt_create_test_score_bands;

-- ---------------------------------------------------------------------------
-- 6. test_attempts — is_flagged_cheating
-- ---------------------------------------------------------------------------
SET @ta_flagged_col := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'test_attempts' AND COLUMN_NAME = 'is_flagged_cheating'
);
SET @sql_ta_add_flagged := IF(
  @test_attempts_tbl = 0 OR @ta_flagged_col > 0,
  'SELECT 1',
  'ALTER TABLE test_attempts ADD COLUMN is_flagged_cheating TINYINT(1) NOT NULL DEFAULT 0'
);
PREPARE stmt_ta_add_flagged FROM @sql_ta_add_flagged;
EXECUTE stmt_ta_add_flagged;
DEALLOCATE PREPARE stmt_ta_add_flagged;

-- ---------------------------------------------------------------------------
-- 7. test_cheating_violations
-- ---------------------------------------------------------------------------
SET @test_cheating_violations_tbl := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'test_cheating_violations'
);

SET @sql_create_test_cheating_violations := IF(
  @test_attempts_tbl = 0,
  'SELECT ''SKIP: test_attempts table missing'' AS migration_skip',
  IF(
    @test_cheating_violations_tbl > 0,
    'SELECT ''SKIP: test_cheating_violations already exists'' AS migration_skip',
    'CREATE TABLE test_cheating_violations (
      id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      attempt_id BIGINT NOT NULL,
      violation_number INT NOT NULL,
      violation_type VARCHAR(64) NOT NULL,
      occurred_at DATETIME NOT NULL,
      created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_test_cheating_violations_attempt_id (attempt_id),
      UNIQUE KEY uq_tcv_attempt_violation (attempt_id, violation_number),
      CONSTRAINT fk_tcv_attempt FOREIGN KEY (attempt_id) REFERENCES test_attempts(id) ON DELETE CASCADE,
      CONSTRAINT chk_tcv_violation_number CHECK (violation_number BETWEEN 1 AND 3)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
  )
);

PREPARE stmt_create_test_cheating_violations FROM @sql_create_test_cheating_violations;
EXECUTE stmt_create_test_cheating_violations;
DEALLOCATE PREPARE stmt_create_test_cheating_violations;

SELECT 'test_engine_extension migration complete' AS migration_status;
