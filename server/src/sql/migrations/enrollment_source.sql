-- Add enrollment_source to canonical enrollments table (idempotent via ensureEnrollmentSourceSchema.js)
ALTER TABLE enrollments
  ADD COLUMN enrollment_source ENUM('free', 'paid') NULL DEFAULT NULL
  AFTER access_status;

ALTER TABLE enrollments
  ADD KEY idx_enrollments_user_course_access (user_id, course_id, access_status);
