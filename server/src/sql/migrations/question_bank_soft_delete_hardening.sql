-- =============================================================================
-- MRB LMS — question_bank soft-delete hardening (deleted_by + index strategy)
-- =============================================================================
-- PRODUCTION-CRITICAL | ADDITIVE ONLY | IDEMPOTENT | ZERO DATA LOSS
--
-- Adds:
--   • deleted_by BIGINT NULL  (after deleted_at)
--   • FK fk_qb_deleted_by → users(id) ON DELETE SET NULL
--   • idx_qb_deleted_at (deleted_at)
--   • idx_qb_active_list (deleted_at, course_id, id)
--   • chk_qb_soft_delete_actor (deleted_at IS NULL OR deleted_by IS NOT NULL)
--
-- Preserves:
--   • all existing rows and column values
--   • existing APIs (deleted_at filter unchanged; deleted_by is additive)
--
-- Rollback companion: question_bank_soft_delete_hardening_rollback.sql
--
-- Run:
--   mysql -u USER -p DATABASE_NAME < question_bank_soft_delete_hardening.sql
-- =============================================================================

SET @db := DATABASE();

-- ---------------------------------------------------------------------------
-- PREFLIGHT
-- ---------------------------------------------------------------------------
SET @qb_tbl := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'question_bank'
);

SET @users_tbl := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users'
);

SET @deleted_at_col := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'question_bank' AND COLUMN_NAME = 'deleted_at'
);

SELECT IF(@qb_tbl = 0, 'FAIL: question_bank table missing', 'OK: question_bank exists') AS preflight_qb;
SELECT IF(@users_tbl = 0, 'FAIL: users table missing', 'OK: users exists') AS preflight_users;
SELECT IF(@deleted_at_col = 0, 'FAIL: deleted_at column missing on question_bank', 'OK: deleted_at present') AS preflight_deleted_at;

-- Rows already soft-deleted without actor — informational (CHECK will allow NULL deleted_by until backfill)
SELECT COUNT(*) AS soft_deleted_without_actor
FROM question_bank
WHERE deleted_at IS NOT NULL AND deleted_by IS NULL;

-- Orphan deleted_by values (run after column add, before FK — must be 0)
-- SELECT COUNT(*) FROM question_bank qb LEFT JOIN users u ON u.id = qb.deleted_by WHERE qb.deleted_by IS NOT NULL AND u.id IS NULL;

-- ---------------------------------------------------------------------------
-- 1. ADD deleted_by column (nullable, online-safe)
-- ---------------------------------------------------------------------------
SET @deleted_by_col := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'question_bank' AND COLUMN_NAME = 'deleted_by'
);

SET @deleted_by_type_ok := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db
    AND TABLE_NAME = 'question_bank'
    AND COLUMN_NAME = 'deleted_by'
    AND COLUMN_TYPE = 'bigint'
    AND IS_NULLABLE = 'YES'
);

SET @sql_add_deleted_by := IF(
  @qb_tbl = 0,
  'SELECT ''SKIP: question_bank missing'' AS migration_skip',
  IF(
    @deleted_by_col > 0 AND @deleted_by_type_ok > 0,
    'SELECT ''SKIP: deleted_by already present with expected type'' AS migration_skip',
    IF(
      @deleted_by_col > 0 AND @deleted_by_type_ok = 0,
      'SELECT ''FAIL: deleted_by exists but type/nullability mismatch — manual review required'' AS migration_error',
      'ALTER TABLE question_bank ADD COLUMN deleted_by BIGINT NULL AFTER deleted_at, ALGORITHM=INPLACE, LOCK=NONE'
    )
  )
);

PREPARE stmt_qb_add_deleted_by FROM @sql_add_deleted_by;
EXECUTE stmt_qb_add_deleted_by;
DEALLOCATE PREPARE stmt_qb_add_deleted_by;

-- ---------------------------------------------------------------------------
-- 2. INDEX idx_qb_deleted_at — recycle-bin / deletion timeline queries
-- ---------------------------------------------------------------------------
SET @idx_deleted_at := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'question_bank' AND INDEX_NAME = 'idx_qb_deleted_at'
);

SET @sql_add_idx_deleted_at := IF(
  @qb_tbl = 0,
  'SELECT 1',
  IF(
    @idx_deleted_at > 0,
    'SELECT ''SKIP: idx_qb_deleted_at already exists'' AS migration_skip',
    'ALTER TABLE question_bank ADD INDEX idx_qb_deleted_at (deleted_at), ALGORITHM=INPLACE, LOCK=NONE'
  )
);

PREPARE stmt_qb_idx_deleted_at FROM @sql_add_idx_deleted_at;
EXECUTE stmt_qb_idx_deleted_at;
DEALLOCATE PREPARE stmt_qb_idx_deleted_at;

-- ---------------------------------------------------------------------------
-- 3. INDEX idx_qb_active_list — admin list: active rows by course, newest first
--    Covers: WHERE deleted_at IS NULL [AND course_id = ?] ORDER BY id DESC
-- ---------------------------------------------------------------------------
SET @idx_active_list := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'question_bank' AND INDEX_NAME = 'idx_qb_active_list'
);

SET @sql_add_idx_active_list := IF(
  @qb_tbl = 0,
  'SELECT 1',
  IF(
    @idx_active_list > 0,
    'SELECT ''SKIP: idx_qb_active_list already exists'' AS migration_skip',
    'ALTER TABLE question_bank ADD INDEX idx_qb_active_list (deleted_at, course_id, id), ALGORITHM=INPLACE, LOCK=NONE'
  )
);

PREPARE stmt_qb_idx_active_list FROM @sql_add_idx_active_list;
EXECUTE stmt_qb_idx_active_list;
DEALLOCATE PREPARE stmt_qb_active_list;

-- ---------------------------------------------------------------------------
-- 4. FOREIGN KEY fk_qb_deleted_by → users(id)
--    ON DELETE SET NULL: retain soft-deleted row if admin account is removed
-- ---------------------------------------------------------------------------
SET @fk_deleted_by := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db
    AND TABLE_NAME = 'question_bank'
    AND CONSTRAINT_NAME = 'fk_qb_deleted_by'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);

SET @sql_add_fk_deleted_by := IF(
  @qb_tbl = 0 OR @users_tbl = 0,
  'SELECT ''SKIP: prerequisite tables missing'' AS migration_skip',
  IF(
    @fk_deleted_by > 0,
    'SELECT ''SKIP: fk_qb_deleted_by already exists'' AS migration_skip',
    'ALTER TABLE question_bank ADD CONSTRAINT fk_qb_deleted_by FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE SET NULL'
  )
);

PREPARE stmt_qb_fk_deleted_by FROM @sql_add_fk_deleted_by;
EXECUTE stmt_qb_fk_deleted_by;
DEALLOCATE PREPARE stmt_qb_fk_deleted_by;

-- ---------------------------------------------------------------------------
-- 5. CHECK constraint — actor required when row is soft-deleted (MySQL 8.0.16+)
--    Skipped automatically if soft-deleted rows exist without deleted_by (backfill first).
-- ---------------------------------------------------------------------------
SET @soft_deleted_no_actor := (
  SELECT COUNT(*) FROM question_bank WHERE deleted_at IS NOT NULL AND deleted_by IS NULL
);

SET @chk_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db
    AND TABLE_NAME = 'question_bank'
    AND CONSTRAINT_NAME = 'chk_qb_soft_delete_actor'
    AND CONSTRAINT_TYPE = 'CHECK'
);

SET @sql_add_chk := IF(
  @qb_tbl = 0,
  'SELECT 1',
  IF(
    @chk_exists > 0,
    'SELECT ''SKIP: chk_qb_soft_delete_actor already exists'' AS migration_skip',
    IF(
      @soft_deleted_no_actor > 0,
      'SELECT ''WARN: soft-deleted rows without deleted_by — backfill before enforcing CHECK'' AS migration_warn',
      'ALTER TABLE question_bank ADD CONSTRAINT chk_qb_soft_delete_actor CHECK (deleted_at IS NULL OR deleted_by IS NOT NULL)'
    )
  )
);

PREPARE stmt_qb_chk FROM @sql_add_chk;
EXECUTE stmt_qb_chk;
DEALLOCATE PREPARE stmt_qb_chk;

-- ---------------------------------------------------------------------------
-- POST-MIGRATION VALIDATION (read-only)
-- ---------------------------------------------------------------------------
SELECT
  COLUMN_NAME,
  COLUMN_TYPE,
  IS_NULLABLE,
  COLUMN_DEFAULT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = @db
  AND TABLE_NAME = 'question_bank'
  AND COLUMN_NAME IN ('deleted_at', 'deleted_by')
ORDER BY ORDINAL_POSITION;

SELECT
  INDEX_NAME,
  COLUMN_NAME,
  SEQ_IN_INDEX,
  NON_UNIQUE
FROM INFORMATION_SCHEMA.STATISTICS
WHERE TABLE_SCHEMA = @db
  AND TABLE_NAME = 'question_bank'
  AND INDEX_NAME IN ('idx_qb_deleted_at', 'idx_qb_active_list', 'fk_qb_deleted_by')
ORDER BY INDEX_NAME, SEQ_IN_INDEX;

SELECT
  CONSTRAINT_NAME,
  CONSTRAINT_TYPE
FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
WHERE TABLE_SCHEMA = @db
  AND TABLE_NAME = 'question_bank'
  AND CONSTRAINT_NAME IN ('fk_qb_deleted_by', 'chk_qb_soft_delete_actor');

SELECT COUNT(*) AS total_questions FROM question_bank;
SELECT COUNT(*) AS active_questions FROM question_bank WHERE deleted_at IS NULL;
SELECT COUNT(*) AS soft_deleted_questions FROM question_bank WHERE deleted_at IS NOT NULL;
