-- =============================================================================
-- MRB LMS — question_bank.question_image_url + question_options.image_url
-- =============================================================================
-- ADDITIVE ONLY | IDEMPOTENT | ZERO DATA LOSS
--
-- Adds:
--   • question_bank.question_image_url VARCHAR(1000) NULL (after question_text)
--   • question_options.image_url VARCHAR(1000) NULL (after option_text)
--
-- Preserves:
--   • all existing columns, foreign keys, indexes, and constraints
--
-- Rollback companion: question_bank_option_image_urls_rollback.sql
--
-- Run:
--   mysql -u USER -p DATABASE_NAME < question_bank_option_image_urls.sql
-- =============================================================================

SET @db := DATABASE();

-- ---------------------------------------------------------------------------
-- 1. question_bank.question_image_url
-- ---------------------------------------------------------------------------
SET @qb_tbl := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'question_bank'
);

SET @qb_image_col := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'question_bank' AND COLUMN_NAME = 'question_image_url'
);

SET @sql_qb_add_image := IF(
  @qb_tbl = 0 OR @qb_image_col > 0,
  'SELECT 1',
  'ALTER TABLE question_bank ADD COLUMN question_image_url VARCHAR(1000) NULL AFTER question_text'
);

PREPARE stmt_qb_add_image FROM @sql_qb_add_image;
EXECUTE stmt_qb_add_image;
DEALLOCATE PREPARE stmt_qb_add_image;

-- ---------------------------------------------------------------------------
-- 2. question_options.image_url
-- ---------------------------------------------------------------------------
SET @qo_tbl := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'question_options'
);

SET @qo_image_col := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'question_options' AND COLUMN_NAME = 'image_url'
);

SET @sql_qo_add_image := IF(
  @qo_tbl = 0 OR @qo_image_col > 0,
  'SELECT 1',
  'ALTER TABLE question_options ADD COLUMN image_url VARCHAR(1000) NULL AFTER option_text'
);

PREPARE stmt_qo_add_image FROM @sql_qo_add_image;
EXECUTE stmt_qo_add_image;
DEALLOCATE PREPARE stmt_qo_add_image;

-- ---------------------------------------------------------------------------
-- VERIFICATION
-- ---------------------------------------------------------------------------
SELECT
  TABLE_NAME,
  COLUMN_NAME,
  COLUMN_TYPE,
  IS_NULLABLE,
  COLUMN_DEFAULT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = @db
  AND TABLE_NAME IN ('question_bank', 'question_options')
  AND COLUMN_NAME IN ('question_image_url', 'image_url')
ORDER BY TABLE_NAME, ORDINAL_POSITION;
