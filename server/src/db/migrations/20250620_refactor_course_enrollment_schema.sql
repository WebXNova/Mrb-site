-- ============================================
-- REFACTOR COURSE ENROLLMENT SCHEMA
-- Migration: 20250620_refactor_course_enrollment_schema
-- Runner: src/db/runEnrollmentRefactorMigration.js
-- ============================================

-- Step 1: Add new simplified columns on courses
ALTER TABLE courses
  ADD COLUMN start_date DATE NULL COMMENT 'Course start date',
  ADD COLUMN end_date DATE NULL COMMENT 'Course end date',
  ADD COLUMN admission_status ENUM('OPEN', 'CLOSED') NOT NULL DEFAULT 'CLOSED' COMMENT 'Admission status for enrollment';

-- Step 2: Performance indexes
CREATE INDEX idx_courses_admission_status ON courses(admission_status);
CREATE INDEX idx_courses_start_date ON courses(start_date);
CREATE INDEX idx_courses_end_date ON courses(end_date);

-- Step 3: Date validation (end_date >= start_date when both set)
ALTER TABLE courses
  ADD CONSTRAINT chk_course_dates
  CHECK (start_date IS NULL OR end_date IS NULL OR start_date <= end_date);

-- Step 4a: Deprecate legacy enrollment columns on courses (if present on older databases)
-- Handled idempotently by runEnrollmentRefactorMigration.js via INFORMATION_SCHEMA checks.

-- Step 4b: Deprecate batch enrollment fields (canonical location in current schema)
ALTER TABLE course_batches
  MODIFY COLUMN enrollment_open_at DATETIME NOT NULL COMMENT 'DEPRECATED: Use courses.admission_status instead',
  MODIFY COLUMN enrollment_close_at DATETIME NOT NULL COMMENT 'DEPRECATED: Use courses.admission_status instead',
  MODIFY COLUMN allow_enrollment TINYINT(1) NOT NULL DEFAULT 1 COMMENT 'DEPRECATED: Use courses.admission_status instead';

-- Step 5: Backward-compatibility view
CREATE OR REPLACE VIEW vw_course_enrollment_status AS
SELECT
  id,
  title,
  description,
  start_date,
  end_date,
  admission_status,
  CASE
    WHEN admission_status = 'OPEN' THEN TRUE
    ELSE FALSE
  END AS is_enrollment_open,
  CASE
    WHEN admission_status = 'OPEN' THEN 'Enrollment is open'
    ELSE 'Admissions are currently closed.'
  END AS enrollment_message
FROM courses;
