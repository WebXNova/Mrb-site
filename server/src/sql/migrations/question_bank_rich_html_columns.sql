-- MRB LMS — Rich HTML columns for question_bank / question_options
-- Backward compatible: nullable columns; legacy question_text / option_text / explanation remain authoritative fallbacks.

SET @db := DATABASE();

-- question_bank.question_html
SET @col_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'question_bank' AND COLUMN_NAME = 'question_html'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE question_bank ADD COLUMN question_html LONGTEXT NULL AFTER question_text',
  'SELECT ''question_html already exists'' AS info'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- question_bank.explanation_html
SET @col_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'question_bank' AND COLUMN_NAME = 'explanation_html'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE question_bank ADD COLUMN explanation_html LONGTEXT NULL AFTER explanation',
  'SELECT ''explanation_html already exists'' AS info'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- question_options.option_html
SET @col_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'question_options' AND COLUMN_NAME = 'option_html'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE question_options ADD COLUMN option_html LONGTEXT NULL AFTER option_text',
  'SELECT ''option_html already exists'' AS info'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Backfill from legacy columns (idempotent)
UPDATE question_bank
SET question_html = question_text
WHERE question_html IS NULL AND question_text IS NOT NULL AND TRIM(question_text) <> '';

UPDATE question_bank
SET explanation_html = explanation
WHERE explanation_html IS NULL AND explanation IS NOT NULL AND TRIM(explanation) <> '';

UPDATE question_options
SET option_html = option_text
WHERE option_html IS NULL AND option_text IS NOT NULL AND TRIM(option_text) <> '';
