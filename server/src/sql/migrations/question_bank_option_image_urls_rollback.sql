-- =============================================================================
-- MRB LMS — rollback question_bank.question_image_url + question_options.image_url
-- =============================================================================
-- WARNING: Drops columns and any stored image URL values in those columns.
--
-- Run:
--   mysql -u USER -p DATABASE_NAME < question_bank_option_image_urls_rollback.sql
-- =============================================================================

SET @db := DATABASE();

SET @qb_image_col := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'question_bank' AND COLUMN_NAME = 'question_image_url'
);

SET @sql_qb_drop_image := IF(
  @qb_image_col = 0,
  'SELECT 1',
  'ALTER TABLE question_bank DROP COLUMN question_image_url'
);

PREPARE stmt_qb_drop_image FROM @sql_qb_drop_image;
EXECUTE stmt_qb_drop_image;
DEALLOCATE PREPARE stmt_qb_drop_image;

SET @qo_image_col := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'question_options' AND COLUMN_NAME = 'image_url'
);

SET @sql_qo_drop_image := IF(
  @qo_image_col = 0,
  'SELECT 1',
  'ALTER TABLE question_options DROP COLUMN image_url'
);

PREPARE stmt_qo_drop_image FROM @sql_qo_drop_image;
EXECUTE stmt_qo_drop_image;
DEALLOCATE PREPARE stmt_qo_drop_image;

SELECT
  TABLE_NAME,
  COLUMN_NAME
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = @db
  AND TABLE_NAME IN ('question_bank', 'question_options')
  AND COLUMN_NAME IN ('question_image_url', 'image_url');
