-- =============================================================================
-- MRB LMS — PHASE 2: Link lectures → chapters (COURSE → SUBJECT → CHAPTER → LECTURE)
-- =============================================================================
-- Safe data migration: NO deletes of business rows; does NOT DROP subject_id
-- from lectures (MRB canonical schema has NO subject_id on lectures — uses course_id).
--
-- Prerequisites (run SELECTs manually; resolve before COMMITTING data steps):
--   • lectures.course_id aligns with subjects.course_id (see PRECHECK 2).
--
-- REVERSIBILITY: Snapshot tables mrb_migration_phase2_lectures_bak / _chapters_bak
--   are created once (skipped if names already exist). Use rollback companion script.
--
-- Run in mysql client connected to target DB:
--   mysql -u ... -p your_db < phase2_link_lectures_to_chapters.sql
-- Or paste sections (recommended: backup + prechecks → review → data steps → validation).
-- =============================================================================

-- STEP 4 (first): SAFETY SNAPSHOTS — full row copies, no DELETE of originals
-- =============================================================================

SET @bak_lect_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'mrb_migration_phase2_lectures_bak'
);
SET @bak_ch_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'mrb_migration_phase2_chapters_bak'
);

SET @snap_lect_sql := IF(
  @bak_lect_exists > 0,
  'SELECT 1 AS snapshot_lectures_skipped_already_exists',
  'CREATE TABLE mrb_migration_phase2_lectures_bak LIKE lectures'
);
PREPARE _s1 FROM @snap_lect_sql;
EXECUTE _s1;
DEALLOCATE PREPARE _s1;

SET @snap_ch_sql := IF(
  @bak_ch_exists > 0,
  'SELECT 1 AS snapshot_chapters_skipped_already_exists',
  'CREATE TABLE mrb_migration_phase2_chapters_bak LIKE chapters'
);
PREPARE _s2 FROM @snap_ch_sql;
EXECUTE _s2;
DEALLOCATE PREPARE _s2;

SET @ins_lect_bak_sql := IF(
  @bak_lect_exists > 0,
  'SELECT 1',
  'INSERT INTO mrb_migration_phase2_lectures_bak SELECT * FROM lectures'
);
PREPARE _i1 FROM @ins_lect_bak_sql;
EXECUTE _i1;
DEALLOCATE PREPARE _i1;

SET @ins_ch_bak_sql := IF(
  @bak_ch_exists > 0,
  'SELECT 1',
  'INSERT INTO mrb_migration_phase2_chapters_bak SELECT * FROM chapters'
);
PREPARE _i2 FROM @ins_ch_bak_sql;
EXECUTE _i2;
DEALLOCATE PREPARE _i2;

-- =============================================================================
-- PRECHECKS (review results before data migration; no writes below this line until OK)
-- =============================================================================

-- PRECHECK 1: subjects without chapters (informational — Step 1 will create General Chapter).
SELECT COUNT(*) AS subjects_without_any_chapter
FROM subjects s
WHERE NOT EXISTS (SELECT 1 FROM chapters c WHERE c.subject_id = s.id);

-- PRECHECK 2: lectures whose course has NO subject — MUST be 0 before migration.
SELECT DISTINCT l.course_id AS orphan_course_need_subjects_before_phase2
FROM lectures l
LEFT JOIN subjects su ON su.course_id = l.course_id
WHERE su.id IS NULL;

-- =============================================================================
-- STEP 1 — Default "General Chapter" per subject (idempotent via NOT EXISTS title)
-- Strengthened vs bare "no chapters": handles subjects that already have other chapters.
-- =============================================================================

START TRANSACTION;

INSERT INTO chapters (subject_id, title, description, order_index, is_active)
SELECT
  s.id,
  'General Chapter',
  'Auto-created system migration chapter',
  0,
  1
FROM subjects s
WHERE NOT EXISTS (
  SELECT 1
  FROM chapters c
  WHERE c.subject_id = s.id
    AND c.title = 'General Chapter'
);

-- =============================================================================
-- STEP 2 — Assign lectures.chapter_id
-- -----------------------------------------------------------------------------
-- MRB schema: lectures have course_id (not subject_id). Map each lecture to the
-- "General Chapter" of the deterministic subject MIN(s.id) for that course.
-- Alternate (if production has lectures.subject_id): see bottom COMMENT block.
-- =============================================================================

UPDATE lectures l
INNER JOIN (
  SELECT s.course_id,
         MIN(s.id) AS pick_subject_id
  FROM subjects s
  GROUP BY s.course_id
) picked ON picked.course_id = l.course_id
INNER JOIN chapters c
  ON c.subject_id = picked.pick_subject_id
  AND c.title = 'General Chapter'
SET l.chapter_id = c.id
WHERE l.chapter_id IS NULL;

COMMIT;

-- =============================================================================
-- STEP 3 — VALIDATION CHECKS
-- =============================================================================

-- CHECK 1 — ORPHAN LECTURES (expected: orphan_lectures = 0)
SELECT COUNT(*) AS orphan_lectures
FROM lectures
WHERE chapter_id IS NULL;

-- CHECK 2 — INVALID CHAPTER LINKS (expected: empty result set)
SELECT l.id AS lecture_id
FROM lectures l
LEFT JOIN chapters c ON l.chapter_id = c.id
WHERE l.chapter_id IS NOT NULL
  AND c.id IS NULL;

-- CHECK 2b — Lecture subject chain vs lecture course (should match MRB invariant)
SELECT l.id AS lecture_id, l.course_id AS lecture_course_id, s.course_id AS subject_course_via_chapter
FROM lectures l
INNER JOIN chapters c ON l.chapter_id = c.id
INNER JOIN subjects s ON s.id = c.subject_id
WHERE l.course_id <> s.course_id;

-- CHECK 3 — FULL RELATION INTEGRITY (all lectures with chapters)
SELECT
  l.id AS lecture_id,
  l.title AS lecture_title,
  c.title AS chapter_title,
  s.title AS subject_title,
  l.course_id,
  s.id AS subject_id
FROM lectures l
JOIN chapters c ON l.chapter_id = c.id
JOIN subjects s ON c.subject_id = s.id;

-- =============================================================================
-- OPTIONAL: Uncomment if your LMS has column lectures.subject_id and you MUST
-- map by subject instead of course-level MIN(subject):
--
-- STEP 2 ALT (requires subject_id on lectures — NOT present in mrb-site schema.sql)
-- -----------------------------------------------------------------------------
-- INSERT INTO chapters (subject_id, title, description, order_index, is_active)
-- SELECT s.id, 'General Chapter', 'Auto-created system migration chapter', 0, 1
-- FROM subjects s
-- WHERE NOT EXISTS (
--   SELECT 1 FROM chapters c
--   WHERE c.subject_id = s.id AND c.title = 'General Chapter'
-- );
--
-- UPDATE lectures l
-- JOIN chapters c ON c.subject_id = l.subject_id AND c.title = 'General Chapter'
-- SET l.chapter_id = c.id
-- WHERE l.chapter_id IS NULL;
-- =============================================================================
