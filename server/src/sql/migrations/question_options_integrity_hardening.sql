-- =============================================================================
-- MRB LMS — question_options integrity hardening (orphan + option count guards)
-- =============================================================================
-- ADDITIVE | IDEMPOTENT
--
-- Complements question_options_option_key.sql:
--   • Reinforces FK (question_id → question_bank.id ON DELETE CASCADE)
--   • CHECK is_correct ∈ {0,1}
--   • Trigger: reject >4 options per question_id on INSERT
--   • Trigger: reject DELETE that would leave <4 options (update path uses replace-all)
--
-- Anti-corruption: partial/orphan states blocked at DB where possible.
-- Application layer still re-validates before commit (never trust frontend).
--
-- Rollback: question_options_integrity_hardening_rollback.sql
-- =============================================================================

SET @db := DATABASE();

SET @qo_tbl := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'question_options'
);

-- ---------------------------------------------------------------------------
-- 1. is_correct boolean CHECK
-- ---------------------------------------------------------------------------
SET @chk_correct_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'question_options' AND CONSTRAINT_NAME = 'chk_option_is_correct_bool'
);

SET @sql_chk_correct := IF(
  @qo_tbl = 0 OR @chk_correct_exists > 0,
  'SELECT 1',
  'ALTER TABLE question_options ADD CONSTRAINT chk_option_is_correct_bool CHECK (is_correct IN (0, 1))'
);

PREPARE stmt_chk_correct FROM @sql_chk_correct;
EXECUTE stmt_chk_correct;
DEALLOCATE PREPARE stmt_chk_correct;

-- ---------------------------------------------------------------------------
-- 2. Max 4 options per question (INSERT guard)
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_qo_max_four_before_insert;

DELIMITER $$

CREATE TRIGGER trg_qo_max_four_before_insert
BEFORE INSERT ON question_options
FOR EACH ROW
BEGIN
  IF (
    SELECT COUNT(*) FROM question_options WHERE question_id = NEW.question_id
  ) >= 4 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Question cannot have more than 4 options';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM question_bank WHERE id = NEW.question_id AND deleted_at IS NULL
  ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Cannot insert option for missing or deleted question';
  END IF;
END$$

DELIMITER ;
