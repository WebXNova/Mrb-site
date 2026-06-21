-- =============================================================================
-- MRB LMS — users.status rollback (removes 'inactive'; migrates rows first)
-- =============================================================================
-- Run only when intentionally reverting teacher inactive status support.
--   mysql -u USER -p DATABASE_NAME < users_status_add_inactive_rollback.sql
-- =============================================================================

SET @db := DATABASE();

SET @users_tbl := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users'
);

SET @status_col := (
  SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'status'
  LIMIT 1
);

SET @sql_migrate_inactive := IF(
  @users_tbl = 0 OR LOWER(@status_col) NOT LIKE '%inactive%',
  'SELECT ''SKIP: inactive value not present'' AS rollback_skip',
  'UPDATE users SET status = ''suspended'' WHERE status = ''inactive'''
);

PREPARE stmt_migrate_inactive FROM @sql_migrate_inactive;
EXECUTE stmt_migrate_inactive;
DEALLOCATE PREPARE stmt_migrate_inactive;

SET @sql_rollback_status := IF(
  @users_tbl = 0 OR LOWER(@status_col) NOT LIKE '%inactive%',
  'SELECT ''SKIP: nothing to rollback'' AS rollback_skip',
  'ALTER TABLE users MODIFY COLUMN status ENUM(''active'', ''suspended'') NOT NULL DEFAULT ''active'''
);

PREPARE stmt_rollback_status FROM @sql_rollback_status;
EXECUTE stmt_rollback_status;
DEALLOCATE PREPARE stmt_rollback_status;
