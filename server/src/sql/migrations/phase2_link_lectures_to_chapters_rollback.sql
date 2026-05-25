-- =============================================================================
-- MRB LMS — PHASE 2 ROLLBACK: Restore lectures.chapter_id and chapters snapshot
-- =============================================================================
-- Run ONLY if mrb_migration_phase2_lectures_bak and mrb_migration_phase2_chapters_bak
-- were created successfully by phase2_link_lectures_to_chapters.sql before migration ran.
--
-- NO lecture row DELETE: restores lecture fields from snapshot and replaces
-- chapters table contents with pre-migration copy (destructive ONLY to chapters
-- rows not in backup — i.e. restores exact prior chapters state).
--
-- If you added FK from lectures(chapter_id) → chapters(id) elsewhere, DISABLE it
-- for the duration or drop/re-add per your infra (not in mrb-site schema baseline).
-- =============================================================================

START TRANSACTION;

DELETE FROM chapters;
INSERT INTO chapters SELECT * FROM mrb_migration_phase2_chapters_bak;

UPDATE lectures dest
INNER JOIN mrb_migration_phase2_lectures_bak bak ON bak.id = dest.id
SET dest.chapter_id = bak.chapter_id;

COMMIT;

-- Post-rollback validations (mirror phase2 checks)
SELECT COUNT(*) AS orphan_lectures_optional
FROM lectures
WHERE chapter_id IS NULL;

