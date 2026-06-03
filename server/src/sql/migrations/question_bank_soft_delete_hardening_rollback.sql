-- =============================================================================
-- MRB LMS — ROLLBACK: question_bank soft-delete hardening
-- =============================================================================
-- Reverses schema additions from question_bank_soft_delete_hardening.sql
--
-- SAFETY GATE:
--   Aborts if ANY row has deleted_by populated (audit data would be lost).
--   Clear or export deleted_by values first if rollback is mandatory.
--
-- Run:
--   mysql -u USER -p DATABASE_NAME < question_bank_soft_delete_hardening_rollback.sql
-- =============================================================================

SET @db := DATABASE();

SET @qb_tbl := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'question_bank'
);

SET @deleted_by_populated := (
  SELECT COUNT(*) FROM question_bank WHERE deleted_by IS NOT NULL
);

SELECT IF(@qb_tbl = 0, 'FAIL: question_bank missing', 'OK') AS preflight;
SELECT @deleted_by_populated AS rows_with_deleted_by_before_rollback;

-- ---------------------------------------------------------------------------
-- 1. DROP CHECK constraint
-- ---------------------------------------------------------------------------
SET @chk_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db
    AND TABLE_NAME = 'question_bank'
    AND CONSTRAINT_NAME = 'chk_qb_soft_delete_actor'
    AND CONSTRAINT_TYPE = 'CHECK'
);

SET @sql_drop_chk := IF(
  @qb_tbl = 0 OR @deleted_by_populated > 0 OR @chk_exists = 0,
  'SELECT IF(@deleted_by_populated > 0, ''ABORT: deleted_by populated — rollback blocked'', ''SKIP: CHECK missing'') AS rollback_status',
  'ALTER TABLE question_bank DROP CHECK chk_qb_soft_delete_actor'
);
PREPARE stmt_rb_chk FROM @sql_drop_chk;
EXECUTE stmt_rb_chk;
DEALLOCATE PREPARE stmt_rb_chk;

-- ---------------------------------------------------------------------------
-- 2. DROP FOREIGN KEY
-- ---------------------------------------------------------------------------
SET @fk_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db
    AND TABLE_NAME = 'question_bank'
    AND CONSTRAINT_NAME = 'fk_qb_deleted_by'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);

SET @populated_after_chk := (
  SELECT COUNT(*) FROM question_bank WHERE deleted_by IS NOT NULL
);

SET @sql_drop_fk := IF(
  @qb_tbl = 0 OR @populated_after_chk > 0 OR @fk_exists = 0,
  'SELECT IF(@populated_after_chk > 0, ''ABORT: deleted_by populated — rollback blocked'', ''SKIP: FK missing'') AS rollback_status',
  'ALTER TABLE question_bank DROP FOREIGN KEY fk_qb_deleted_by'
);
PREPARE stmt_rb_fk FROM @sql_drop_fk;
EXECUTE stmt_rb_fk;
DEALLOCATE PREPARE stmt_rb_fk;

-- ---------------------------------------------------------------------------
-- 3. DROP indexes (reverse order of creation)
-- ---------------------------------------------------------------------------
SET @idx_active_list := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'question_bank' AND INDEX_NAME = 'idx_qb_active_list'
);

SET @populated_after_fk := (
  SELECT COUNT(*) FROM question_bank WHERE deleted_by IS NOT NULL
);

SET @sql_drop_idx_active := IF(
  @qb_tbl = 0 OR @populated_after_fk > 0 OR @idx_active_list = 0,
  'SELECT IF(@populated_after_fk > 0, ''ABORT: deleted_by populated — rollback blocked'', ''SKIP: idx_qb_active_list missing'') AS rollback_status',
  'ALTER TABLE question_bank DROP INDEX idx_qb_active_list'
);
PREPARE stmt_rb_idx_active FROM @sql_drop_idx_active;
EXECUTE stmt_rb_idx_active;
DEALLOCATE PREPARE stmt_rb_idx_active;

SET @idx_deleted_at := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'question_bank' AND INDEX_NAME = 'idx_qb_deleted_at'
);

SET @populated_after_idx_active := (
  SELECT COUNT(*) FROM question_bank WHERE deleted_by IS NOT NULL
);

SET @sql_drop_idx_deleted_at := IF(
  @qb_tbl = 0 OR @populated_after_idx_active > 0 OR @idx_deleted_at = 0,
  'SELECT IF(@populated_after_idx_active > 0, ''ABORT: deleted_by populated — rollback blocked'', ''SKIP: idx_qb_deleted_at missing'') AS rollback_status',
  'ALTER TABLE question_bank DROP INDEX idx_qb_deleted_at'
);
PREPARE stmt_rb_idx_deleted_at FROM @sql_drop_idx_deleted_at;
EXECUTE stmt_rb_idx_deleted_at;
DEALLOCATE PREPARE stmt_rb_idx_deleted_at;

-- ---------------------------------------------------------------------------
-- 4. DROP deleted_by column
-- ---------------------------------------------------------------------------
SET @deleted_by_col := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'question_bank' AND COLUMN_NAME = 'deleted_by'
);

SET @populated_final := (
  SELECT COUNT(*) FROM question_bank WHERE deleted_by IS NOT NULL
);

SET @sql_drop_col := IF(
  @qb_tbl = 0 OR @populated_final > 0 OR @deleted_by_col = 0,
  'SELECT IF(@populated_final > 0, ''ABORT: deleted_by populated — rollback blocked'', ''SKIP: deleted_by column missing'') AS rollback_status',
  'ALTER TABLE question_bank DROP COLUMN deleted_by'
);
PREPARE stmt_rb_col FROM @sql_drop_col;
EXECUTE stmt_rb_col;
DEALLOCATE PREPARE stmt_rb_col;

-- ---------------------------------------------------------------------------
-- POST-ROLLBACK VALIDATION
-- ---------------------------------------------------------------------------
SELECT
  COLUMN_NAME,
  COLUMN_TYPE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = @db
  AND TABLE_NAME = 'question_bank'
  AND COLUMN_NAME IN ('deleted_at', 'deleted_by')
ORDER BY ORDINAL_POSITION;
