-- =============================================================================
-- MRB LMS — student_questions ORPHAN AUDIT (read-only)
-- =============================================================================
-- Run BEFORE student_questions_integrity_hardening.sql on production.
-- Produces counts only — no mutations.
--
-- Usage:
--   mysql -u USER -p DATABASE_NAME < student_questions_orphan_audit.sql
-- =============================================================================

SET @db := DATABASE();

SELECT @db AS database_name, NOW() AS audited_at;

SET @sq_tbl := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'student_questions'
);

SELECT IF(@sq_tbl = 0, 'FAIL: student_questions missing', 'OK') AS preflight;

-- ---------------------------------------------------------------------------
-- 1. Missing parent: user_id (NOT NULL — blocks FK if any orphan)
-- ---------------------------------------------------------------------------
SELECT 'orphan_user_id' AS check_name, COUNT(*) AS orphan_count
FROM student_questions sq
LEFT JOIN users u ON u.id = sq.user_id
WHERE @sq_tbl > 0 AND u.id IS NULL;

SELECT sq.id, sq.user_id, sq.status, sq.created_at
FROM student_questions sq
LEFT JOIN users u ON u.id = sq.user_id
WHERE @sq_tbl > 0 AND u.id IS NULL
ORDER BY sq.id
LIMIT 100;

-- ---------------------------------------------------------------------------
-- 2. Missing parent: course_id (nullable)
-- ---------------------------------------------------------------------------
SELECT 'orphan_course_id' AS check_name, COUNT(*) AS orphan_count
FROM student_questions sq
LEFT JOIN courses c ON c.id = sq.course_id
WHERE @sq_tbl > 0 AND sq.course_id IS NOT NULL AND c.id IS NULL;

SELECT sq.id, sq.course_id, sq.subject_id, sq.user_id
FROM student_questions sq
LEFT JOIN courses c ON c.id = sq.course_id
WHERE @sq_tbl > 0 AND sq.course_id IS NOT NULL AND c.id IS NULL
ORDER BY sq.id
LIMIT 100;

-- ---------------------------------------------------------------------------
-- 3. Missing parent: subject_id (nullable)
-- ---------------------------------------------------------------------------
SELECT 'orphan_subject_id' AS check_name, COUNT(*) AS orphan_count
FROM student_questions sq
LEFT JOIN subjects s ON s.id = sq.subject_id
WHERE @sq_tbl > 0 AND sq.subject_id IS NOT NULL AND s.id IS NULL;

SELECT sq.id, sq.subject_id, sq.course_id, sq.user_id
FROM student_questions sq
LEFT JOIN subjects s ON s.id = sq.subject_id
WHERE @sq_tbl > 0 AND sq.subject_id IS NOT NULL AND s.id IS NULL
ORDER BY sq.id
LIMIT 100;

-- ---------------------------------------------------------------------------
-- 4. Missing parent: assigned_teacher_id (nullable)
-- ---------------------------------------------------------------------------
SELECT 'orphan_assigned_teacher_id' AS check_name, COUNT(*) AS orphan_count
FROM student_questions sq
LEFT JOIN users u ON u.id = sq.assigned_teacher_id
WHERE @sq_tbl > 0 AND sq.assigned_teacher_id IS NOT NULL AND u.id IS NULL;

SELECT sq.id, sq.assigned_teacher_id, sq.subject_id, sq.status
FROM student_questions sq
LEFT JOIN users u ON u.id = sq.assigned_teacher_id
WHERE @sq_tbl > 0 AND sq.assigned_teacher_id IS NOT NULL AND u.id IS NULL
ORDER BY sq.id
LIMIT 100;

-- ---------------------------------------------------------------------------
-- 5. Missing parent: answered_by (nullable)
-- ---------------------------------------------------------------------------
SELECT 'orphan_answered_by' AS check_name, COUNT(*) AS orphan_count
FROM student_questions sq
LEFT JOIN users u ON u.id = sq.answered_by
WHERE @sq_tbl > 0 AND sq.answered_by IS NOT NULL AND u.id IS NULL;

SELECT sq.id, sq.answered_by, sq.answered_at, sq.status
FROM student_questions sq
LEFT JOIN users u ON u.id = sq.answered_by
WHERE @sq_tbl > 0 AND sq.answered_by IS NOT NULL AND u.id IS NULL
ORDER BY sq.id
LIMIT 100;

-- ---------------------------------------------------------------------------
-- 6. Semantic: assigned_teacher_id not role=teacher
-- ---------------------------------------------------------------------------
SELECT 'assigned_teacher_wrong_role' AS check_name, COUNT(*) AS orphan_count
FROM student_questions sq
INNER JOIN users u ON u.id = sq.assigned_teacher_id
WHERE @sq_tbl > 0 AND u.role <> 'teacher';

SELECT sq.id, sq.assigned_teacher_id, u.role, u.email
FROM student_questions sq
INNER JOIN users u ON u.id = sq.assigned_teacher_id
WHERE @sq_tbl > 0 AND u.role <> 'teacher'
ORDER BY sq.id
LIMIT 100;

-- ---------------------------------------------------------------------------
-- 7. Semantic: subject_id course mismatch
-- ---------------------------------------------------------------------------
SELECT 'subject_course_mismatch' AS check_name, COUNT(*) AS mismatch_count
FROM student_questions sq
INNER JOIN subjects s ON s.id = sq.subject_id
WHERE @sq_tbl > 0
  AND sq.course_id IS NOT NULL
  AND sq.course_id <> s.course_id;

SELECT sq.id, sq.course_id AS question_course_id, s.course_id AS subject_course_id, sq.subject_id
FROM student_questions sq
INNER JOIN subjects s ON s.id = sq.subject_id
WHERE @sq_tbl > 0
  AND sq.course_id IS NOT NULL
  AND sq.course_id <> s.course_id
ORDER BY sq.id
LIMIT 100;

-- ---------------------------------------------------------------------------
-- 8. Existing constraints / indexes snapshot
-- ---------------------------------------------------------------------------
SELECT CONSTRAINT_NAME, CONSTRAINT_TYPE
FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'student_questions'
  AND CONSTRAINT_TYPE IN ('FOREIGN KEY', 'PRIMARY KEY')
ORDER BY CONSTRAINT_NAME;

SELECT INDEX_NAME, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS columns
FROM INFORMATION_SCHEMA.STATISTICS
WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'student_questions'
GROUP BY INDEX_NAME
ORDER BY INDEX_NAME;

SELECT COUNT(*) AS total_rows FROM student_questions WHERE @sq_tbl > 0;
