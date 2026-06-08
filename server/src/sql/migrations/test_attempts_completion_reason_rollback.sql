-- =============================================================================
-- MRB LMS — rollback test_attempts.completion_reason
-- =============================================================================
-- WARNING: drops completion_reason and any stored values in that column.
-- =============================================================================

SET @db := DATABASE();

SET @ta_completion_reason_col := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'test_attempts' AND COLUMN_NAME = 'completion_reason'
);

SET @sql_ta_drop_completion_reason := IF(
  @ta_completion_reason_col = 0,
  'SELECT 1',
  'ALTER TABLE test_attempts DROP COLUMN completion_reason'
);

PREPARE stmt_ta_drop_completion_reason FROM @sql_ta_drop_completion_reason;
EXECUTE stmt_ta_drop_completion_reason;
DEALLOCATE PREPARE stmt_ta_drop_completion_reason;
