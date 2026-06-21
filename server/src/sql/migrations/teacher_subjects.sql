-- =============================================================================
-- MRB LMS — teacher_subjects (teacher ↔ subject assignment junction)
-- =============================================================================
-- PRODUCTION-CRITICAL | ADDITIVE ONLY | IDEMPOTENT | ZERO DATA LOSS
--
-- Teachers are users with role='teacher'. No separate teachers table.
-- Composite PK (teacher_id, subject_id) prevents duplicate assignments.
--
-- Rollback companion: teacher_subjects_rollback.sql
-- Node bootstrap:      src/db/ensureTeacherSubjectsSchema.js
--
-- Run:
--   mysql -u USER -p DATABASE_NAME < teacher_subjects.sql
-- =============================================================================

SET @db := DATABASE();

SET @users_tbl := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users'
);

SET @subjects_tbl := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'subjects'
);

SET @teacher_subjects_tbl := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'teacher_subjects'
);

SELECT IF(@users_tbl = 0, 'FAIL: users table missing', 'OK: users exists') AS preflight_users;
SELECT IF(@subjects_tbl = 0, 'FAIL: subjects table missing', 'OK: subjects exists') AS preflight_subjects;

SET @sql_create_teacher_subjects := IF(
  @users_tbl = 0 OR @subjects_tbl = 0,
  'SELECT ''SKIP: prerequisite tables missing'' AS migration_skip',
  IF(
    @teacher_subjects_tbl > 0,
    'SELECT ''SKIP: teacher_subjects already exists'' AS migration_skip',
    'CREATE TABLE teacher_subjects (
      teacher_id BIGINT NOT NULL,
      subject_id BIGINT NOT NULL,
      assigned_by BIGINT NULL,
      assigned_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (teacher_id, subject_id),
      KEY idx_teacher_subjects_subject (subject_id),
      KEY idx_teacher_subjects_assigned_by (assigned_by),
      CONSTRAINT fk_teacher_subjects_teacher FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_teacher_subjects_subject FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
      CONSTRAINT fk_teacher_subjects_assigned_by FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
  )
);

PREPARE stmt_create_teacher_subjects FROM @sql_create_teacher_subjects;
EXECUTE stmt_create_teacher_subjects;
DEALLOCATE PREPARE stmt_create_teacher_subjects;

-- ---------------------------------------------------------------------------
-- Role guard: teacher_id must reference users.role = ''teacher''
-- (MySQL cannot FK-filter by role; trigger enforces at write time.)
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_teacher_subjects_teacher_role_before_insert;

CREATE TRIGGER trg_teacher_subjects_teacher_role_before_insert
BEFORE INSERT ON teacher_subjects
FOR EACH ROW
BEGIN
  IF (
    SELECT COUNT(*) FROM users u
    WHERE u.id = NEW.teacher_id AND u.role = 'teacher'
  ) = 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'teacher_id must reference a user with role=teacher';
  END IF;
END;

SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'teacher_subjects') > 0,
  'OK: teacher_subjects ready',
  'FAIL: teacher_subjects not created'
) AS migration_result;
