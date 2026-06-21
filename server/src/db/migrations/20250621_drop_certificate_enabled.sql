-- Remove unused certificate_enabled from course_batches (certificates not offered).
ALTER TABLE course_batches DROP COLUMN certificate_enabled;
