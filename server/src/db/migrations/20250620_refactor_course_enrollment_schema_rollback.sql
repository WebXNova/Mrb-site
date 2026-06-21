-- ============================================
-- ROLLBACK: Refactor Course Enrollment Schema
-- Runner: node src/db/runEnrollmentRefactorMigration.js --rollback
-- ============================================

DROP VIEW IF EXISTS vw_course_enrollment_status;

ALTER TABLE courses DROP CHECK chk_course_dates;

DROP INDEX idx_courses_admission_status ON courses;
DROP INDEX idx_courses_start_date ON courses;
DROP INDEX idx_courses_end_date ON courses;

ALTER TABLE courses
  DROP COLUMN start_date,
  DROP COLUMN end_date,
  DROP COLUMN admission_status;

-- Restore course_batches column comments (types unchanged)
ALTER TABLE course_batches
  MODIFY COLUMN enrollment_open_at DATETIME NOT NULL,
  MODIFY COLUMN enrollment_close_at DATETIME NOT NULL,
  MODIFY COLUMN allow_enrollment TINYINT(1) NOT NULL DEFAULT 1;

-- Legacy courses enrollment columns (if present) restored by runner when applicable
