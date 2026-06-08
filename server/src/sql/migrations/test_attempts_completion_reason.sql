-- =============================================================================
-- MRB LMS — test_attempts.completion_reason (additive, idempotent)
-- =============================================================================
-- Tracks why an attempt ended: submitted | auto_submitted | expired | admin_closed
--
-- Rollback companion: test_attempts_completion_reason_rollback.sql
--
-- Run:
--   mysql -u USER -p DATABASE_NAME < test_attempts_completion_reason.sql
-- =============================================================================

SET @db := DATABASE();

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
