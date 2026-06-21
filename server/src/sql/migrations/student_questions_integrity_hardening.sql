-- =============================================================================
-- MRB LMS — student_questions integrity hardening
-- =============================================================================
-- PRODUCTION-SAFE | IDEMPOTENT | ONLINE INDEX BUILDS (INPLACE / LOCK=NONE)
--
-- Adds:
--   • Foreign keys: user_id, course_id, subject_id, assigned_teacher_id, answered_by
--   • Indexes for hot query paths (skips duplicates when left-prefix already exists)
--   • Write-time trigger: assigned_teacher_id must be role=teacher
--
-- Prerequisites:
--   1. student_questions_orphan_audit.sql   (read-only)
--   2. student_questions_orphan_cleanup.sql (mutations — backup first)
--
-- Rollback: student_questions_integrity_hardening_rollback.sql
-- Node CLI: scripts/run-student-questions-integrity-migration.mjs
-- =============================================================================

SET @db := DATABASE();

SET @sq_tbl := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'student_questions'
);

SET @users_tbl := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users'
);

SET @courses_tbl := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'courses'
);

SET @subjects_tbl := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'subjects'
);

SELECT IF(@sq_tbl = 0, 'FAIL: student_questions missing', 'OK: student_questions') AS preflight_sq;
SELECT IF(@users_tbl = 0, 'FAIL: users missing', 'OK: users') AS preflight_users;
SELECT IF(@courses_tbl = 0, 'WARN: courses missing — course_id FK skipped', 'OK: courses') AS preflight_courses;
SELECT IF(@subjects_tbl = 0, 'WARN: subjects missing — subject_id FK skipped', 'OK: subjects') AS preflight_subjects;

-- ---------------------------------------------------------------------------
-- Helper: index exists?
-- ---------------------------------------------------------------------------
-- Indexes are added only when no existing index uses the column as leftmost prefix.

-- idx_sq_user_id (user_id)
SET @has_user_idx := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'student_questions' AND SEQ_IN_INDEX = 1 AND COLUMN_NAME = 'user_id'
);
SET @sql_idx_user := IF(
  @sq_tbl = 0 OR @has_user_idx > 0,
  'SELECT ''SKIP idx_sq_user_id'' AS step',
  'ALTER TABLE student_questions ADD INDEX idx_sq_user_id (user_id), ALGORITHM=INPLACE, LOCK=NONE'
);
PREPARE s_idx_user FROM @sql_idx_user; EXECUTE s_idx_user; DEALLOCATE PREPARE s_idx_user;

-- idx_sq_status (status)
SET @has_status_idx := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'student_questions' AND SEQ_IN_INDEX = 1 AND COLUMN_NAME = 'status'
);
SET @sql_idx_status := IF(
  @sq_tbl = 0 OR @has_status_idx > 0,
  'SELECT ''SKIP idx_sq_status'' AS step',
  'ALTER TABLE student_questions ADD INDEX idx_sq_status (status), ALGORITHM=INPLACE, LOCK=NONE'
);
PREPARE s_idx_status FROM @sql_idx_status; EXECUTE s_idx_status; DEALLOCATE PREPARE s_idx_status;

-- idx_sq_created_at (created_at)
SET @has_created_idx := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'student_questions' AND SEQ_IN_INDEX = 1 AND COLUMN_NAME = 'created_at'
);
SET @sql_idx_created := IF(
  @sq_tbl = 0 OR @has_created_idx > 0,
  'SELECT ''SKIP idx_sq_created_at'' AS step',
  'ALTER TABLE student_questions ADD INDEX idx_sq_created_at (created_at), ALGORITHM=INPLACE, LOCK=NONE'
);
PREPARE s_idx_created FROM @sql_idx_created; EXECUTE s_idx_created; DEALLOCATE PREPARE s_idx_created;

-- idx_sq_updated_at (updated_at)
SET @has_updated_idx := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'student_questions' AND SEQ_IN_INDEX = 1 AND COLUMN_NAME = 'updated_at'
);
SET @sql_idx_updated := IF(
  @sq_tbl = 0 OR @has_updated_idx > 0,
  'SELECT ''SKIP idx_sq_updated_at'' AS step',
  'ALTER TABLE student_questions ADD INDEX idx_sq_updated_at (updated_at), ALGORITHM=INPLACE, LOCK=NONE'
);
PREPARE s_idx_updated FROM @sql_idx_updated; EXECUTE s_idx_updated; DEALLOCATE PREPARE s_idx_updated;

-- idx_sq_course_id (course_id)
SET @has_course_idx := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'student_questions' AND SEQ_IN_INDEX = 1 AND COLUMN_NAME = 'course_id'
);
SET @sql_idx_course := IF(
  @sq_tbl = 0 OR @has_course_idx > 0,
  'SELECT ''SKIP idx_sq_course_id'' AS step',
  'ALTER TABLE student_questions ADD INDEX idx_sq_course_id (course_id), ALGORITHM=INPLACE, LOCK=NONE'
);
PREPARE s_idx_course FROM @sql_idx_course; EXECUTE s_idx_course; DEALLOCATE PREPARE s_idx_course;

-- idx_sq_subject_id (subject_id) — not leftmost in idx_sq_course_subject_status
SET @has_subject_idx := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'student_questions' AND SEQ_IN_INDEX = 1 AND COLUMN_NAME = 'subject_id'
);
SET @sql_idx_subject := IF(
  @sq_tbl = 0 OR @has_subject_idx > 0,
  'SELECT ''SKIP idx_sq_subject_id'' AS step',
  'ALTER TABLE student_questions ADD INDEX idx_sq_subject_id (subject_id), ALGORITHM=INPLACE, LOCK=NONE'
);
PREPARE s_idx_subject FROM @sql_idx_subject; EXECUTE s_idx_subject; DEALLOCATE PREPARE s_idx_subject;

-- idx_sq_assigned_teacher_id (assigned_teacher_id)
SET @has_teacher_idx := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'student_questions' AND SEQ_IN_INDEX = 1 AND COLUMN_NAME = 'assigned_teacher_id'
);
SET @sql_idx_teacher := IF(
  @sq_tbl = 0 OR @has_teacher_idx > 0,
  'SELECT ''SKIP idx_sq_assigned_teacher_id'' AS step',
  'ALTER TABLE student_questions ADD INDEX idx_sq_assigned_teacher_id (assigned_teacher_id), ALGORITHM=INPLACE, LOCK=NONE'
);
PREPARE s_idx_teacher FROM @sql_idx_teacher; EXECUTE s_idx_teacher; DEALLOCATE PREPARE s_idx_teacher;

-- Composite indexes (workload-optimized — idempotent)
SET @has_inbox_idx := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'student_questions' AND INDEX_NAME = 'idx_sq_teacher_inbox'
);
SET @sql_idx_inbox := IF(
  @sq_tbl = 0 OR @has_inbox_idx > 0,
  'SELECT ''SKIP idx_sq_teacher_inbox'' AS step',
  'ALTER TABLE student_questions ADD INDEX idx_sq_teacher_inbox (assigned_teacher_id, status, updated_at), ALGORITHM=INPLACE, LOCK=NONE'
);
PREPARE s_idx_inbox FROM @sql_idx_inbox; EXECUTE s_idx_inbox; DEALLOCATE PREPARE s_idx_inbox;

SET @has_css_idx := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'student_questions' AND INDEX_NAME = 'idx_sq_course_subject_status'
);
SET @sql_idx_css := IF(
  @sq_tbl = 0 OR @has_css_idx > 0,
  'SELECT ''SKIP idx_sq_course_subject_status'' AS step',
  'ALTER TABLE student_questions ADD INDEX idx_sq_course_subject_status (course_id, subject_id, status), ALGORITHM=INPLACE, LOCK=NONE'
);
PREPARE s_idx_css FROM @sql_idx_css; EXECUTE s_idx_css; DEALLOCATE PREPARE s_idx_css;

-- ---------------------------------------------------------------------------
-- Foreign keys (run only when orphan counts are zero)
-- ---------------------------------------------------------------------------

-- user_id → users(id)
SET @fk_user := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'student_questions'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY'
    AND CONSTRAINT_NAME IN ('fk_student_questions_user', 'fk_sq_user_id')
);
SET @sql_fk_user := IF(
  @sq_tbl = 0 OR @users_tbl = 0 OR @fk_user > 0,
  'SELECT ''SKIP fk user_id'' AS step',
  'ALTER TABLE student_questions ADD CONSTRAINT fk_sq_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE'
);
PREPARE s_fk_user FROM @sql_fk_user; EXECUTE s_fk_user; DEALLOCATE PREPARE s_fk_user;

-- course_id → courses(id)
SET @fk_course := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'student_questions'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY' AND CONSTRAINT_NAME = 'fk_sq_course_id'
);
SET @sql_fk_course := IF(
  @sq_tbl = 0 OR @courses_tbl = 0 OR @fk_course > 0,
  'SELECT ''SKIP fk course_id'' AS step',
  'ALTER TABLE student_questions ADD CONSTRAINT fk_sq_course_id FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE SET NULL ON UPDATE CASCADE'
);
PREPARE s_fk_course FROM @sql_fk_course; EXECUTE s_fk_course; DEALLOCATE PREPARE s_fk_course;

-- subject_id → subjects(id)
SET @fk_subject := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'student_questions'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY' AND CONSTRAINT_NAME = 'fk_sq_subject_id'
);
SET @sql_fk_subject := IF(
  @sq_tbl = 0 OR @subjects_tbl = 0 OR @fk_subject > 0,
  'SELECT ''SKIP fk subject_id'' AS step',
  'ALTER TABLE student_questions ADD CONSTRAINT fk_sq_subject_id FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE SET NULL ON UPDATE CASCADE'
);
PREPARE s_fk_subject FROM @sql_fk_subject; EXECUTE s_fk_subject; DEALLOCATE PREPARE s_fk_subject;

-- assigned_teacher_id → users(id)
SET @fk_teacher := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'student_questions'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY' AND CONSTRAINT_NAME = 'fk_sq_assigned_teacher_id'
);
SET @sql_fk_teacher := IF(
  @sq_tbl = 0 OR @users_tbl = 0 OR @fk_teacher > 0,
  'SELECT ''SKIP fk assigned_teacher_id'' AS step',
  'ALTER TABLE student_questions ADD CONSTRAINT fk_sq_assigned_teacher_id FOREIGN KEY (assigned_teacher_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE'
);
PREPARE s_fk_teacher FROM @sql_fk_teacher; EXECUTE s_fk_teacher; DEALLOCATE PREPARE s_fk_teacher;

-- answered_by → users(id)
SET @fk_answered := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'student_questions'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY'
    AND CONSTRAINT_NAME IN ('fk_student_questions_answered_by', 'fk_sq_answered_by')
);
SET @sql_fk_answered := IF(
  @sq_tbl = 0 OR @users_tbl = 0 OR @fk_answered > 0,
  'SELECT ''SKIP fk answered_by'' AS step',
  'ALTER TABLE student_questions ADD CONSTRAINT fk_sq_answered_by FOREIGN KEY (answered_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE'
);
PREPARE s_fk_answered FROM @sql_fk_answered; EXECUTE s_fk_answered; DEALLOCATE PREPARE s_fk_answered;

-- ---------------------------------------------------------------------------
-- Trigger: assigned_teacher_id must reference role=teacher (MySQL cannot FK-filter role)
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_sq_assigned_teacher_role_before_insert;
DROP TRIGGER IF EXISTS trg_sq_assigned_teacher_role_before_update;

DELIMITER $$

CREATE TRIGGER trg_sq_assigned_teacher_role_before_insert
BEFORE INSERT ON student_questions
FOR EACH ROW
BEGIN
  IF NEW.assigned_teacher_id IS NOT NULL AND (
    SELECT COUNT(*) FROM users u
    WHERE u.id = NEW.assigned_teacher_id AND u.role = 'teacher'
  ) = 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'assigned_teacher_id must reference a user with role=teacher';
  END IF;
END$$

CREATE TRIGGER trg_sq_assigned_teacher_role_before_update
BEFORE UPDATE ON student_questions
FOR EACH ROW
BEGIN
  IF NEW.assigned_teacher_id IS NOT NULL AND (
    SELECT COUNT(*) FROM users u
    WHERE u.id = NEW.assigned_teacher_id AND u.role = 'teacher'
  ) = 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'assigned_teacher_id must reference a user with role=teacher';
  END IF;
END$$

DELIMITER ;

SELECT 'student_questions_integrity_hardening complete' AS status;
