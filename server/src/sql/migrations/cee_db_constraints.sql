-- CEE DB constraints (idempotent manual migration companion to ensureCeeDbConstraints.js)
-- Enrollment one-active-per-user is enforced in application code (enrollmentLifecycle.service.js).
-- No triggers or stored procedures required.

-- 1) Orphan audit (must return 0 before NOT NULL)
-- SELECT id, title FROM tests WHERE course_id IS NULL;

-- 2) tests.course_id NOT NULL (skip if orphans remain)
-- ALTER TABLE tests MODIFY COLUMN course_id BIGINT NOT NULL;

-- 3) Optional: drop legacy triggers if a previous deploy created them
-- DROP TRIGGER IF EXISTS cee_enrollments_one_active_per_user;
-- DROP TRIGGER IF EXISTS cee_enrollments_one_active_per_user_upd;
