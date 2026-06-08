-- =============================================================================
-- MRB LMS — question_options.option_key + single-correct enforcement
-- =============================================================================
-- ADDITIVE | IDEMPOTENT
--
-- Adds:
--   • option_key CHAR(1) NOT NULL (A–D)
--   • UNIQUE (question_id, option_key)
--   • CHECK option_key IN ('A','B','C','D')
--   • Triggers preventing multiple is_correct = 1 per question_id
--
-- Rollback: question_options_option_key_rollback.sql
-- =============================================================================

SET @db := DATABASE();

-- ---------------------------------------------------------------------------
-- 1. option_key column
-- ---------------------------------------------------------------------------
SET @qo_tbl := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'question_options'
);

SET @qo_key_col := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'question_options' AND COLUMN_NAME = 'option_key'
);

SET @sql_add_key := IF(
  @qo_tbl = 0 OR @qo_key_col > 0,
  'SELECT 1',
  'ALTER TABLE question_options ADD COLUMN option_key CHAR(1) NULL AFTER question_id'
);

PREPARE stmt_add_key FROM @sql_add_key;
EXECUTE stmt_add_key;
DEALLOCATE PREPARE stmt_add_key;

-- Backfill from sort_order when column was just added
SET @sql_backfill := IF(
  @qo_tbl = 0,
  'SELECT 1',
  'UPDATE question_options SET option_key = CASE sort_order WHEN 0 THEN ''A'' WHEN 1 THEN ''B'' WHEN 2 THEN ''C'' WHEN 3 THEN ''D'' ELSE ''A'' END WHERE option_key IS NULL'
);

PREPARE stmt_backfill FROM @sql_backfill;
EXECUTE stmt_backfill;
DEALLOCATE PREPARE stmt_backfill;

SET @sql_key_not_null := IF(
  @qo_tbl = 0 OR @qo_key_col > 0,
  'SELECT 1',
  'ALTER TABLE question_options MODIFY option_key CHAR(1) NOT NULL'
);

PREPARE stmt_key_not_null FROM @sql_key_not_null;
EXECUTE stmt_key_not_null;
DEALLOCATE PREPARE stmt_key_not_null;

-- ---------------------------------------------------------------------------
-- 2. Unique question_id + option_key
-- ---------------------------------------------------------------------------
SET @uq_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'question_options' AND INDEX_NAME = 'uq_question_option_key'
);

SET @sql_uq := IF(
  @qo_tbl = 0 OR @uq_exists > 0,
  'SELECT 1',
  'ALTER TABLE question_options ADD UNIQUE KEY uq_question_option_key (question_id, option_key)'
);

PREPARE stmt_uq FROM @sql_uq;
EXECUTE stmt_uq;
DEALLOCATE PREPARE stmt_uq;

-- ---------------------------------------------------------------------------
-- 3. CHECK constraint (MySQL 8.0.16+)
-- ---------------------------------------------------------------------------
SET @chk_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'question_options' AND CONSTRAINT_NAME = 'chk_option_key_mcq'
);

SET @sql_chk := IF(
  @qo_tbl = 0 OR @chk_exists > 0,
  'SELECT 1',
  'ALTER TABLE question_options ADD CONSTRAINT chk_option_key_mcq CHECK (option_key IN (''A'',''B'',''C'',''D''))'
);

PREPARE stmt_chk FROM @sql_chk;
EXECUTE stmt_chk;
DEALLOCATE PREPARE stmt_chk;

-- ---------------------------------------------------------------------------
-- 4. Triggers — database enforces final consistency (one correct per question)
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_qo_single_correct_before_insert;
DROP TRIGGER IF EXISTS trg_qo_single_correct_before_update;

DELIMITER $$

CREATE TRIGGER trg_qo_single_correct_before_insert
BEFORE INSERT ON question_options
FOR EACH ROW
BEGIN
  IF NEW.is_correct = 1 THEN
    IF (
      SELECT COUNT(*) FROM question_options
      WHERE question_id = NEW.question_id AND is_correct = 1
    ) > 0 THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Only one correct option allowed per question';
    END IF;
  END IF;
END$$

CREATE TRIGGER trg_qo_single_correct_before_update
BEFORE UPDATE ON question_options
FOR EACH ROW
BEGIN
  IF NEW.is_correct = 1 AND OLD.is_correct = 0 THEN
    IF (
      SELECT COUNT(*) FROM question_options
      WHERE question_id = NEW.question_id AND is_correct = 1 AND id <> NEW.id
    ) > 0 THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Only one correct option allowed per question';
    END IF;
  END IF;
END$$

DELIMITER ;
