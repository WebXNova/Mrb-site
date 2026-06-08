-- Rollback question_options.option_key + single-correct triggers

DROP TRIGGER IF EXISTS trg_qo_single_correct_before_insert;
DROP TRIGGER IF EXISTS trg_qo_single_correct_before_update;

SET @db := DATABASE();

SET @chk_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'question_options' AND CONSTRAINT_NAME = 'chk_option_key_mcq'
);

SET @sql_drop_chk := IF(
  @chk_exists = 0,
  'SELECT 1',
  'ALTER TABLE question_options DROP CHECK chk_option_key_mcq'
);

PREPARE stmt_drop_chk FROM @sql_drop_chk;
EXECUTE stmt_drop_chk;
DEALLOCATE PREPARE stmt_drop_chk;

SET @uq_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'question_options' AND INDEX_NAME = 'uq_question_option_key'
);

SET @sql_drop_uq := IF(
  @uq_exists = 0,
  'SELECT 1',
  'ALTER TABLE question_options DROP INDEX uq_question_option_key'
);

PREPARE stmt_drop_uq FROM @sql_drop_uq;
EXECUTE stmt_drop_uq;
DEALLOCATE PREPARE stmt_drop_uq;

SET @qo_key_col := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'question_options' AND COLUMN_NAME = 'option_key'
);

SET @sql_drop_col := IF(
  @qo_key_col = 0,
  'SELECT 1',
  'ALTER TABLE question_options DROP COLUMN option_key'
);

PREPARE stmt_drop_col FROM @sql_drop_col;
EXECUTE stmt_drop_col;
DEALLOCATE PREPARE stmt_drop_col;
