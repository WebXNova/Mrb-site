-- =============================================================================
-- MRB LMS — test_quiz_drafts soft-delete columns
-- =============================================================================
-- Rollback: test_quiz_drafts_soft_delete_rollback.sql
-- Node:     src/db/ensureTestQuizDraftsSchema.js
-- =============================================================================

SET @db := DATABASE();

SET @tqd_tbl := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'test_quiz_drafts'
);

SET @deleted_at_col := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'test_quiz_drafts' AND COLUMN_NAME = 'deleted_at'
);

SET @sql_add_deleted_at := IF(
  @tqd_tbl = 0,
  'SELECT ''SKIP: test_quiz_drafts missing'' AS migration_skip',
  IF(
    @deleted_at_col > 0,
    'SELECT ''SKIP: deleted_at already present'' AS migration_skip',
    'ALTER TABLE test_quiz_drafts ADD COLUMN deleted_at TIMESTAMP NULL DEFAULT NULL AFTER updated_at'
  )
);
PREPARE stmt_tqd_deleted_at FROM @sql_add_deleted_at;
EXECUTE stmt_tqd_deleted_at;
DEALLOCATE PREPARE stmt_tqd_deleted_at;

SET @deleted_by_col := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'test_quiz_drafts' AND COLUMN_NAME = 'deleted_by'
);

SET @sql_add_deleted_by := IF(
  @tqd_tbl = 0,
  'SELECT ''SKIP: test_quiz_drafts missing'' AS migration_skip',
  IF(
    @deleted_by_col > 0,
    'SELECT ''SKIP: deleted_by already present'' AS migration_skip',
    'ALTER TABLE test_quiz_drafts ADD COLUMN deleted_by BIGINT NULL AFTER deleted_at'
  )
);
PREPARE stmt_tqd_deleted_by FROM @sql_add_deleted_by;
EXECUTE stmt_tqd_deleted_by;
DEALLOCATE PREPARE stmt_tqd_deleted_by;

SET @idx_deleted_at := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'test_quiz_drafts' AND INDEX_NAME = 'idx_test_quiz_drafts_deleted_at'
);

SET @sql_add_idx_deleted_at := IF(
  @tqd_tbl = 0 OR @idx_deleted_at > 0,
  'SELECT 1',
  'ALTER TABLE test_quiz_drafts ADD KEY idx_test_quiz_drafts_deleted_at (deleted_at)'
);
PREPARE stmt_tqd_idx_deleted_at FROM @sql_add_idx_deleted_at;
EXECUTE stmt_tqd_idx_deleted_at;
DEALLOCATE PREPARE stmt_tqd_idx_deleted_at;

SET @fk_deleted_by := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'test_quiz_drafts' AND CONSTRAINT_NAME = 'fk_tqd_deleted_by'
);

SET @sql_add_fk_deleted_by := IF(
  @tqd_tbl = 0 OR @fk_deleted_by > 0,
  'SELECT 1',
  'ALTER TABLE test_quiz_drafts ADD CONSTRAINT fk_tqd_deleted_by FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE SET NULL'
);
PREPARE stmt_tqd_fk_deleted_by FROM @sql_add_fk_deleted_by;
EXECUTE stmt_tqd_fk_deleted_by;
DEALLOCATE PREPARE stmt_tqd_fk_deleted_by;
