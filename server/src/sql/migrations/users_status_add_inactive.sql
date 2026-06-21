-- =============================================================================
-- MRB LMS — users.status: add 'inactive' for teacher activation workflow
-- =============================================================================
-- ADDITIVE | IDEMPOTENT
-- Preserves existing 'active' and 'suspended' values.
-- Teachers use active/inactive; suspended remains for security lockouts.
--
-- Rollback: users_status_add_inactive_rollback.sql
-- Node:     src/db/ensureUsersStatusSchema.js
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

SELECT IF(@users_tbl = 0, 'FAIL: users table missing', 'OK: users exists') AS preflight_users;

SET @sql_modify_status := IF(
  @users_tbl = 0,
  'SELECT ''SKIP: users table missing'' AS migration_skip',
  IF(
    LOWER(@status_col) LIKE '%inactive%',
    'SELECT ''SKIP: users.status already includes inactive'' AS migration_skip',
    'ALTER TABLE users MODIFY COLUMN status ENUM(''active'', ''inactive'', ''suspended'') NOT NULL DEFAULT ''active'''
  )
);

PREPARE stmt_modify_status FROM @sql_modify_status;
EXECUTE stmt_modify_status;
DEALLOCATE PREPARE stmt_modify_status;

SELECT IF(
  LOWER((SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'status' LIMIT 1)) LIKE '%inactive%',
  'OK: users.status includes inactive',
  'FAIL: users.status inactive value not present'
) AS migration_result;
