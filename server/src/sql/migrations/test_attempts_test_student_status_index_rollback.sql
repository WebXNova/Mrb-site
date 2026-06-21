-- =============================================================================
-- Rollback — idx_test_attempts_test_student_status
-- =============================================================================

SET @db := DATABASE();

SET @idx_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = @db
    AND TABLE_NAME = 'test_attempts'
    AND INDEX_NAME = 'idx_test_attempts_test_student_status'
);

SET @sql_drop_idx := IF(
  @idx_exists = 0,
  'SELECT 1',
  'ALTER TABLE test_attempts DROP INDEX idx_test_attempts_test_student_status'
);

PREPARE stmt_drop_idx FROM @sql_drop_idx;
EXECUTE stmt_drop_idx;
DEALLOCATE PREPARE stmt_drop_idx;
