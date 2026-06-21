-- Rollback soft-delete columns on test_quiz_drafts (clears deleted_at/deleted_by data when dropped).

SET @db := DATABASE();

SET @tqd_tbl := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'test_quiz_drafts'
);

SET @fk_deleted_by := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'test_quiz_drafts' AND CONSTRAINT_NAME = 'fk_tqd_deleted_by'
);

SET @sql_drop_fk := IF(
  @tqd_tbl = 0 OR @fk_deleted_by = 0,
  'SELECT 1',
  'ALTER TABLE test_quiz_drafts DROP FOREIGN KEY fk_tqd_deleted_by'
);
PREPARE stmt_drop_fk FROM @sql_drop_fk;
EXECUTE stmt_drop_fk;
DEALLOCATE PREPARE stmt_drop_fk;

SET @idx_deleted_at := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'test_quiz_drafts' AND INDEX_NAME = 'idx_test_quiz_drafts_deleted_at'
);

SET @sql_drop_idx := IF(
  @tqd_tbl = 0 OR @idx_deleted_at = 0,
  'SELECT 1',
  'ALTER TABLE test_quiz_drafts DROP INDEX idx_test_quiz_drafts_deleted_at'
);
PREPARE stmt_drop_idx FROM @sql_drop_idx;
EXECUTE stmt_drop_idx;
DEALLOCATE PREPARE stmt_drop_idx;

SET @deleted_by_col := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'test_quiz_drafts' AND COLUMN_NAME = 'deleted_by'
);

SET @sql_drop_deleted_by := IF(
  @tqd_tbl = 0 OR @deleted_by_col = 0,
  'SELECT 1',
  'ALTER TABLE test_quiz_drafts DROP COLUMN deleted_by'
);
PREPARE stmt_drop_deleted_by FROM @sql_drop_deleted_by;
EXECUTE stmt_drop_deleted_by;
DEALLOCATE PREPARE stmt_drop_deleted_by;

SET @deleted_at_col := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'test_quiz_drafts' AND COLUMN_NAME = 'deleted_at'
);

SET @sql_drop_deleted_at := IF(
  @tqd_tbl = 0 OR @deleted_at_col = 0,
  'SELECT 1',
  'ALTER TABLE test_quiz_drafts DROP COLUMN deleted_at'
);
PREPARE stmt_drop_deleted_at FROM @sql_drop_deleted_at;
EXECUTE stmt_drop_deleted_at;
DEALLOCATE PREPARE stmt_drop_deleted_at;
