-- Phase 2: tests.test_access_type (idempotent companion to ensureTestsApplicationSchema.js)
-- Existing rows default to course_locked. course_id stays nullable for standalone rows.

-- ALTER TABLE tests
--   ADD COLUMN test_access_type VARCHAR(32) NOT NULL DEFAULT 'course_locked' AFTER course_id;

-- ALTER TABLE tests
--   ADD KEY idx_tests_access_type (test_access_type);

-- If course_id is NOT NULL on an older database:
-- ALTER TABLE tests MODIFY COLUMN course_id BIGINT NULL;
