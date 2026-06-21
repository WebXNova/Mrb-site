-- CEE DB constraints (idempotent manual migration companion to ensureCeeDbConstraints.js)
-- Enrollment one-active-per-user: DB unique index on enrollments.active_user_id (startup migration).
-- Application activation still flows through enrollmentLifecycle.service.js.

-- 1) Orphan audit (must return 0 before NOT NULL)
-- SELECT id, title FROM tests WHERE course_id IS NULL;

-- 2) tests.course_id NOT NULL (skip if orphans remain)
-- ALTER TABLE tests MODIFY COLUMN course_id BIGINT NOT NULL;

-- 3) Optional: drop legacy triggers if a previous deploy created them
-- DROP TRIGGER IF EXISTS cee_enrollments_one_active_per_user;
-- DROP TRIGGER IF EXISTS cee_enrollments_one_active_per_user_upd;
