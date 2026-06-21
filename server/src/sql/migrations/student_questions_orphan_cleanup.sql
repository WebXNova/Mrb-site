-- =============================================================================
-- MRB LMS — student_questions ORPHAN CLEANUP (pre-FK)
-- =============================================================================
-- Run AFTER orphan audit and BEFORE integrity hardening migration.
--
-- STRATEGY (zero unintended loss):
--   • Backup first: mysqldump --single-transaction DB student_questions > backup.sql
--   • Nullable FK orphans → SET NULL (row preserved)
--   • course_id/subject mismatch → repair course_id from subjects row
--   • Invalid assigned_teacher role → SET NULL
--   • Missing user_id (NOT NULL) → archive then DELETE (rows are unrecoverable in UI anyway)
--
-- Transaction left open for manual verification — COMMIT or ROLLBACK at end.
-- =============================================================================

START TRANSACTION;

-- ---------------------------------------------------------------------------
-- Optional archive (run once). Stores rows removed for missing user_id.
-- ---------------------------------------------------------------------------
-- CREATE TABLE student_questions_orphan_archive LIKE student_questions;
-- ALTER TABLE student_questions_orphan_archive
--   ADD COLUMN archived_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
--   ADD COLUMN archive_reason VARCHAR(128) NULL;

-- INSERT INTO student_questions_orphan_archive
-- SELECT sq.*, CURRENT_TIMESTAMP, 'missing_user_id'
-- FROM student_questions sq
-- LEFT JOIN users u ON u.id = sq.user_id
-- WHERE u.id IS NULL;

DELETE sq FROM student_questions sq
LEFT JOIN users u ON u.id = sq.user_id
WHERE u.id IS NULL;

-- ---------------------------------------------------------------------------
-- Nullable FK orphans → NULL
-- ---------------------------------------------------------------------------
UPDATE student_questions sq
LEFT JOIN courses c ON c.id = sq.course_id
SET sq.course_id = NULL
WHERE sq.course_id IS NOT NULL AND c.id IS NULL;

UPDATE student_questions sq
LEFT JOIN subjects s ON s.id = sq.subject_id
SET sq.subject_id = NULL
WHERE sq.subject_id IS NOT NULL AND s.id IS NULL;

UPDATE student_questions sq
LEFT JOIN users u ON u.id = sq.assigned_teacher_id
SET sq.assigned_teacher_id = NULL
WHERE sq.assigned_teacher_id IS NOT NULL AND u.id IS NULL;

UPDATE student_questions sq
LEFT JOIN users u ON u.id = sq.answered_by
SET sq.answered_by = NULL
WHERE sq.answered_by IS NOT NULL AND u.id IS NULL;

-- ---------------------------------------------------------------------------
-- Semantic repairs
-- ---------------------------------------------------------------------------
UPDATE student_questions sq
INNER JOIN users u ON u.id = sq.assigned_teacher_id
SET sq.assigned_teacher_id = NULL
WHERE u.role <> 'teacher';

UPDATE student_questions sq
INNER JOIN subjects s ON s.id = sq.subject_id
SET sq.course_id = s.course_id
WHERE NOT (sq.course_id <=> s.course_id);

-- ---------------------------------------------------------------------------
-- Verification — all counts must be 0 before COMMIT
-- ---------------------------------------------------------------------------
SELECT 'post_cleanup_orphan_user_id' AS check_name, COUNT(*) AS n
FROM student_questions sq LEFT JOIN users u ON u.id = sq.user_id WHERE u.id IS NULL
UNION ALL
SELECT 'post_cleanup_orphan_course_id', COUNT(*)
FROM student_questions sq LEFT JOIN courses c ON c.id = sq.course_id
WHERE sq.course_id IS NOT NULL AND c.id IS NULL
UNION ALL
SELECT 'post_cleanup_orphan_subject_id', COUNT(*)
FROM student_questions sq LEFT JOIN subjects s ON s.id = sq.subject_id
WHERE sq.subject_id IS NOT NULL AND s.id IS NULL
UNION ALL
SELECT 'post_cleanup_orphan_assigned_teacher', COUNT(*)
FROM student_questions sq LEFT JOIN users u ON u.id = sq.assigned_teacher_id
WHERE sq.assigned_teacher_id IS NOT NULL AND u.id IS NULL
UNION ALL
SELECT 'post_cleanup_orphan_answered_by', COUNT(*)
FROM student_questions sq LEFT JOIN users u ON u.id = sq.answered_by
WHERE sq.answered_by IS NOT NULL AND u.id IS NULL
UNION ALL
SELECT 'post_cleanup_subject_course_mismatch', COUNT(*)
FROM student_questions sq INNER JOIN subjects s ON s.id = sq.subject_id
WHERE sq.course_id IS NOT NULL AND sq.course_id <> s.course_id;

-- COMMIT;
-- ROLLBACK;
