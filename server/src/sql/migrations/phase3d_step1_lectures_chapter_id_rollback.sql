-- =============================================================================
-- MRB LMS — PHASE 3D STEP 1 ROLLBACK (lectures.chapter_id foundation)
-- =============================================================================
-- Reverses ONLY the Step 1 schema additions when safe.
--
-- SAFETY GATE: aborts if ANY lecture row has a non-NULL chapter_id (data present).
-- Use only before backfill or after clearing chapter_id manually with approval.
--
-- Run:
--   mysql -u USER -p DATABASE_NAME < phase3d_step1_lectures_chapter_id_rollback.sql
-- =============================================================================

SET @db := DATABASE();

SET @lectures_tbl := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'lectures'
);

SET @populated := (
  SELECT COUNT(*) FROM lectures WHERE chapter_id IS NOT NULL
);

SET @idx_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'lectures' AND INDEX_NAME = 'idx_lectures_chapter_id'
);

SET @col_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'lectures' AND COLUMN_NAME = 'chapter_id'
);

SELECT IF(@lectures_tbl = 0, 'FAIL: lectures missing', 'OK') AS preflight;
SELECT @populated AS lectures_with_chapter_id_before_rollback;

SET @sql_drop_idx := IF(
  @lectures_tbl = 0 OR @populated > 0 OR @idx_exists = 0,
  'SELECT IF(@populated > 0, ''ABORT: chapter_id populated — rollback blocked'', ''SKIP: index missing'') AS rollback_status',
  'ALTER TABLE lectures DROP INDEX idx_lectures_chapter_id'
);
PREPARE stmt_rb_drop_idx FROM @sql_drop_idx;
EXECUTE stmt_rb_drop_idx;
DEALLOCATE PREPARE stmt_rb_drop_idx;

SET @populated_after_idx := (
  SELECT COUNT(*) FROM lectures WHERE chapter_id IS NOT NULL
);

SET @sql_drop_col := IF(
  @lectures_tbl = 0 OR @populated_after_idx > 0 OR @col_exists = 0,
  'SELECT IF(@populated_after_idx > 0, ''ABORT: chapter_id populated — rollback blocked'', ''SKIP: column missing'') AS rollback_status',
  'ALTER TABLE lectures DROP COLUMN chapter_id'
);
PREPARE stmt_rb_drop_col FROM @sql_drop_col;
EXECUTE stmt_rb_drop_col;
DEALLOCATE PREPARE stmt_rb_drop_col;

SELECT
  COLUMN_NAME,
  COLUMN_TYPE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = @db
  AND TABLE_NAME = 'lectures'
  AND COLUMN_NAME IN ('course_id', 'chapter_id')
ORDER BY ORDINAL_POSITION;
