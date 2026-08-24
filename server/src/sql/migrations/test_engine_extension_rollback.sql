-- =============================================================================
-- MRB LMS — test engine extension rollback
-- =============================================================================
-- Reverses test_engine_extension.sql. Drops new tables and columns only.
-- Violation rows and score-band content in dropped tables will be lost.
--
-- Run:
--   mysql -u USER -p DATABASE_NAME < test_engine_extension_rollback.sql
-- =============================================================================

SET @db := DATABASE();

-- 7. Drop test_cheating_violations
SET @test_cheating_violations_tbl := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'test_cheating_violations'
);
SET @sql_drop_tcv := IF(
  @test_cheating_violations_tbl = 0,
  'SELECT ''SKIP: test_cheating_violations does not exist'' AS rollback_skip',
  'DROP TABLE test_cheating_violations'
);
PREPARE stmt_drop_tcv FROM @sql_drop_tcv;
EXECUTE stmt_drop_tcv;
DEALLOCATE PREPARE stmt_drop_tcv;

-- 6. test_attempts.is_flagged_cheating
SET @ta_flagged_col := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'test_attempts' AND COLUMN_NAME = 'is_flagged_cheating'
);
SET @sql_ta_drop_flagged := IF(
  @ta_flagged_col = 0,
  'SELECT 1',
  'ALTER TABLE test_attempts DROP COLUMN is_flagged_cheating'
);
PREPARE stmt_ta_drop_flagged FROM @sql_ta_drop_flagged;
EXECUTE stmt_ta_drop_flagged;
DEALLOCATE PREPARE stmt_ta_drop_flagged;

-- 5. Drop test_score_bands
SET @test_score_bands_tbl := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'test_score_bands'
);
SET @sql_drop_tsb := IF(
  @test_score_bands_tbl = 0,
  'SELECT ''SKIP: test_score_bands does not exist'' AS rollback_skip',
  'DROP TABLE test_score_bands'
);
PREPARE stmt_drop_tsb FROM @sql_drop_tsb;
EXECUTE stmt_drop_tsb;
DEALLOCATE PREPARE stmt_drop_tsb;

-- 4. test_questions.section_id (FK + column)
SET @fk_tq_section_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'test_questions' AND CONSTRAINT_NAME = 'fk_tq_section' AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);
SET @sql_tq_drop_section_fk := IF(
  @fk_tq_section_exists = 0,
  'SELECT 1',
  'ALTER TABLE test_questions DROP FOREIGN KEY fk_tq_section'
);
PREPARE stmt_tq_drop_section_fk FROM @sql_tq_drop_section_fk;
EXECUTE stmt_tq_drop_section_fk;
DEALLOCATE PREPARE stmt_tq_drop_section_fk;

SET @tq_section_idx := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'test_questions' AND INDEX_NAME = 'idx_test_questions_section_id'
);
SET @sql_tq_drop_section_idx := IF(
  @tq_section_idx = 0,
  'SELECT 1',
  'ALTER TABLE test_questions DROP INDEX idx_test_questions_section_id'
);
PREPARE stmt_tq_drop_section_idx FROM @sql_tq_drop_section_idx;
EXECUTE stmt_tq_drop_section_idx;
DEALLOCATE PREPARE stmt_tq_drop_section_idx;

SET @tq_section_id_col := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'test_questions' AND COLUMN_NAME = 'section_id'
);
SET @sql_tq_drop_section_id := IF(
  @tq_section_id_col = 0,
  'SELECT 1',
  'ALTER TABLE test_questions DROP COLUMN section_id'
);
PREPARE stmt_tq_drop_section_id FROM @sql_tq_drop_section_id;
EXECUTE stmt_tq_drop_section_id;
DEALLOCATE PREPARE stmt_tq_drop_section_id;

-- 3. question_bank.tip_html
ALTER TABLE question_bank DROP COLUMN IF EXISTS tip_html;

-- 2. tests columns
SET @tests_results_released_idx := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'tests' AND INDEX_NAME = 'idx_tests_results_released_at'
);
SET @sql_tests_drop_results_released_idx := IF(
  @tests_results_released_idx = 0,
  'SELECT 1',
  'ALTER TABLE tests DROP INDEX idx_tests_results_released_at'
);
PREPARE stmt_tests_drop_results_released_idx FROM @sql_tests_drop_results_released_idx;
EXECUTE stmt_tests_drop_results_released_idx;
DEALLOCATE PREPARE stmt_tests_drop_results_released_idx;

ALTER TABLE tests DROP COLUMN IF EXISTS full_page_mode;
ALTER TABLE tests DROP COLUMN IF EXISTS results_released_at;
ALTER TABLE tests DROP COLUMN IF EXISTS display_mode;
ALTER TABLE tests DROP COLUMN IF EXISTS layout_mode;

-- 1. Drop test_sections (after section_id FK removed from test_questions)
SET @test_sections_tbl := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'test_sections'
);
SET @sql_drop_test_sections := IF(
  @test_sections_tbl = 0,
  'SELECT ''SKIP: test_sections does not exist'' AS rollback_skip',
  'DROP TABLE test_sections'
);
PREPARE stmt_drop_test_sections FROM @sql_drop_test_sections;
EXECUTE stmt_drop_test_sections;
DEALLOCATE PREPARE stmt_drop_test_sections;

SELECT 'test_engine_extension rollback complete' AS rollback_status;
