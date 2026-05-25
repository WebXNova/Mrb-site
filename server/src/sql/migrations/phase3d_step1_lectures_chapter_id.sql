-- =============================================================================
-- MRB LMS — PHASE 3D STEP 1: Lectures table foundation migration
-- =============================================================================
-- PRODUCTION-CRITICAL | ADDITIVE ONLY | IDEMPOTENT | ZERO DATA LOSS
--
-- Prepares: Course → Subject → Chapter → Lecture
--
-- Adds to `lectures`:
--   • chapter_id BIGINT UNSIGNED NULL  (after course_id)
--   • KEY idx_lectures_chapter_id (chapter_id)
--
-- Preserves:
--   • course_id and all existing columns
--   • all lecture rows unchanged
--   • existing APIs (still course_id–based until service migration)
--
-- Does NOT:
--   • add FK lectures.chapter_id → chapters.id
--   • enforce NOT NULL on chapter_id
--   • remove or rename columns
--   • backfill chapter_id (see phase2_link_lectures_to_chapters.sql)
--
-- Rollback companion: phase3d_step1_lectures_chapter_id_rollback.sql
--
-- Run:
--   mysql -u USER -p DATABASE_NAME < phase3d_step1_lectures_chapter_id.sql
-- =============================================================================

SET @db := DATABASE();

-- ---------------------------------------------------------------------------
-- PREFLIGHT — fail closed with visible messages (no destructive DDL)
-- ---------------------------------------------------------------------------
SET @lectures_tbl := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'lectures'
);

SET @chapters_tbl := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'chapters'
);

SELECT IF(@lectures_tbl = 0, 'FAIL: lectures table missing', 'OK: lectures exists') AS preflight_lectures;
SELECT IF(@chapters_tbl = 0, 'WARN: chapters table missing (Step 1 still safe; backfill blocked until chapters exist)', 'OK: chapters exists') AS preflight_chapters;

-- ---------------------------------------------------------------------------
-- 1. ADD chapter_id (nullable, online-safe ADD COLUMN)
-- ---------------------------------------------------------------------------
SET @chapter_col_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'lectures' AND COLUMN_NAME = 'chapter_id'
);

SET @chapter_col_type_ok := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db
    AND TABLE_NAME = 'lectures'
    AND COLUMN_NAME = 'chapter_id'
    AND COLUMN_TYPE = 'bigint unsigned'
    AND IS_NULLABLE = 'YES'
);

SET @sql_add_chapter_col := IF(
  @lectures_tbl = 0,
  'SELECT ''SKIP: lectures table missing'' AS migration_skip',
  IF(
    @chapter_col_exists > 0 AND @chapter_col_type_ok > 0,
    'SELECT ''SKIP: chapter_id already present with expected type'' AS migration_skip',
    IF(
      @chapter_col_exists > 0 AND @chapter_col_type_ok = 0,
      'SELECT ''FAIL: chapter_id exists but type/nullability mismatch — manual review required'' AS migration_error',
      'ALTER TABLE lectures ADD COLUMN chapter_id BIGINT UNSIGNED NULL AFTER course_id'
    )
  )
);

PREPARE stmt_p3d_add_chapter_col FROM @sql_add_chapter_col;
EXECUTE stmt_p3d_add_chapter_col;
DEALLOCATE PREPARE stmt_p3d_add_chapter_col;

-- ---------------------------------------------------------------------------
-- 2. ADD index idx_lectures_chapter_id (lookup / join preparation)
-- ---------------------------------------------------------------------------
SET @chapter_idx_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'lectures' AND INDEX_NAME = 'idx_lectures_chapter_id'
);

SET @sql_add_chapter_idx := IF(
  @lectures_tbl = 0,
  'SELECT 1',
  IF(
    @chapter_idx_exists > 0,
    'SELECT ''SKIP: idx_lectures_chapter_id already exists'' AS migration_skip',
    'ALTER TABLE lectures ADD KEY idx_lectures_chapter_id (chapter_id)'
  )
);

PREPARE stmt_p3d_add_chapter_idx FROM @sql_add_chapter_idx;
EXECUTE stmt_p3d_add_chapter_idx;
DEALLOCATE PREPARE stmt_p3d_add_chapter_idx;

-- ---------------------------------------------------------------------------
-- 3. POST-MIGRATION VALIDATION (read-only)
-- ---------------------------------------------------------------------------
SELECT
  COLUMN_NAME,
  COLUMN_TYPE,
  IS_NULLABLE,
  COLUMN_DEFAULT,
  EXTRA
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = @db
  AND TABLE_NAME = 'lectures'
  AND COLUMN_NAME IN ('course_id', 'chapter_id')
ORDER BY ORDINAL_POSITION;

SELECT
  INDEX_NAME,
  COLUMN_NAME,
  SEQ_IN_INDEX,
  NON_UNIQUE
FROM INFORMATION_SCHEMA.STATISTICS
WHERE TABLE_SCHEMA = @db
  AND TABLE_NAME = 'lectures'
  AND INDEX_NAME = 'idx_lectures_chapter_id'
ORDER BY SEQ_IN_INDEX;

SELECT COUNT(*) AS lectures_total FROM lectures;
SELECT COUNT(*) AS lectures_with_chapter_id FROM lectures WHERE chapter_id IS NOT NULL;
SELECT COUNT(*) AS lectures_without_chapter_id FROM lectures WHERE chapter_id IS NULL;

-- Orphan chapter_id values (no FK yet — informational only)
SELECT COUNT(*) AS lectures_chapter_id_orphan_count
FROM lectures l
LEFT JOIN chapters c ON c.id = l.chapter_id
WHERE l.chapter_id IS NOT NULL AND c.id IS NULL;
