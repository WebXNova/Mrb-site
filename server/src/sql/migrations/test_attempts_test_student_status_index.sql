-- =============================================================================
-- MRB LMS — test_attempts composite index for active-attempt lookups
-- =============================================================================
-- Supports hot path: test_id + student_id + status (especially in_progress).
-- Complements uq_attempt (test_id, student_id, attempt_number) — status is not
-- covered by that unique key.
--
-- Rollback: test_attempts_test_student_status_index_rollback.sql
--
-- Run:
--   mysql -u USER -p DATABASE_NAME < test_attempts_test_student_status_index.sql
-- =============================================================================

SET @db := DATABASE();

SET @ta_tbl := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'test_attempts'
);

SET @idx_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = @db
    AND TABLE_NAME = 'test_attempts'
    AND INDEX_NAME = 'idx_test_attempts_test_student_status'
);

SET @sql_add_idx := IF(
  @ta_tbl = 0 OR @idx_exists > 0,
  'SELECT 1',
  'ALTER TABLE test_attempts ADD KEY idx_test_attempts_test_student_status (test_id, student_id, status)'
);

PREPARE stmt_add_idx FROM @sql_add_idx;
EXECUTE stmt_add_idx;
DEALLOCATE PREPARE stmt_add_idx;
