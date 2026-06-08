DROP TRIGGER IF EXISTS trg_qo_max_four_before_insert;

SET @db := DATABASE();

SET @chk_correct_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'question_options' AND CONSTRAINT_NAME = 'chk_option_is_correct_bool'
);

SET @sql_drop_chk := IF(
  @chk_correct_exists = 0,
  'SELECT 1',
  'ALTER TABLE question_options DROP CHECK chk_option_is_correct_bool'
);

PREPARE stmt_drop_chk FROM @sql_drop_chk;
EXECUTE stmt_drop_chk;
DEALLOCATE PREPARE stmt_drop_chk;
