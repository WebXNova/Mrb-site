-- Enrollment one-active-per-user DB constraint (idempotent manual companion).
-- Application rule: enrollmentLifecycle.service.js — at most one access_status = 'active' per user.
-- Enforced via generated column + unique index (no triggers).

-- Analyze violations before apply:
-- SELECT user_id, COUNT(*) AS n FROM enrollments WHERE access_status = 'active' GROUP BY user_id HAVING n > 1;

-- Startup runner: ensureEnrollmentOneActivePerUserSchema() via runRequiredStartupMigrations.

-- Rollback: sql/migrations/enrollment_one_active_per_user_rollback.sql
