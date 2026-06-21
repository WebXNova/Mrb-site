-- =============================================================================
-- MRB LMS — test_quiz_drafts rollback (drops table; irreversible data loss)
-- =============================================================================
-- Run only when intentionally removing quiz draft persistence.
--   mysql -u USER -p DATABASE_NAME < test_quiz_drafts_rollback.sql
-- =============================================================================

SET @db := DATABASE();

SET @drafts_tbl := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'test_quiz_drafts'
);

SET @sql_drop_drafts := IF(
  @drafts_tbl = 0,
  'SELECT ''SKIP: test_quiz_drafts does not exist'' AS rollback_skip',
  'DROP TABLE test_quiz_drafts'
);

PREPARE stmt_drop_drafts FROM @sql_drop_drafts;
EXECUTE stmt_drop_drafts;
DEALLOCATE PREPARE stmt_drop_drafts;
