-- Performance indexes (idempotent manual companion to ensurePerformanceIndexesSchema.js)
-- Additive only — no column or table structure changes.

-- test_attempts(test_id, student_id, status)
-- test_attempts(user_id, status)
-- activity_logs(user_id, created_at)

-- Applied automatically at startup via ensurePerformanceIndexesSchema().
