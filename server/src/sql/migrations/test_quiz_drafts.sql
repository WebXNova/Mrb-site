-- =============================================================================
-- MRB LMS — test_quiz_drafts (Quiz Builder server-side draft persistence)
-- =============================================================================
-- PRODUCTION-CRITICAL | ADDITIVE ONLY | IDEMPOTENT | ZERO DATA LOSS
--
-- One draft row per test. Optimistic concurrency via `version`.
--
-- Rollback companion: test_quiz_drafts_rollback.sql
-- Node bootstrap:      src/db/ensureTestQuizDraftsSchema.js
--
-- Run:
--   mysql -u USER -p DATABASE_NAME < test_quiz_drafts.sql
-- =============================================================================

SET @db := DATABASE();

SET @tests_tbl := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'tests'
);

SET @users_tbl := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users'
);

SET @drafts_tbl := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'test_quiz_drafts'
);

SELECT IF(@tests_tbl = 0, 'FAIL: tests table missing', 'OK: tests exists') AS preflight_tests;
SELECT IF(@users_tbl = 0, 'FAIL: users table missing', 'OK: users exists') AS preflight_users;

SET @sql_create_drafts := IF(
  @tests_tbl = 0 OR @users_tbl = 0,
  'SELECT ''SKIP: prerequisite tables missing'' AS migration_skip',
  IF(
    @drafts_tbl > 0,
    'SELECT ''SKIP: test_quiz_drafts already exists'' AS migration_skip',
    'CREATE TABLE test_quiz_drafts (
      draft_id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      test_id BIGINT NOT NULL,
      draft_payload JSON NOT NULL,
      version INT UNSIGNED NOT NULL DEFAULT 1,
      created_by BIGINT NOT NULL,
      created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      deleted_at TIMESTAMP NULL DEFAULT NULL,
      deleted_by BIGINT NULL,
      UNIQUE KEY uq_test_quiz_drafts_test_id (test_id),
      KEY idx_test_quiz_drafts_created_by (created_by),
      KEY idx_test_quiz_drafts_updated_at (updated_at),
      KEY idx_test_quiz_drafts_deleted_at (deleted_at),
      CONSTRAINT fk_tqd_test FOREIGN KEY (test_id) REFERENCES tests(id) ON DELETE CASCADE,
      CONSTRAINT fk_tqd_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
      CONSTRAINT fk_tqd_deleted_by FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE SET NULL,
      CONSTRAINT chk_tqd_version_positive CHECK (version >= 1)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
  )
);

PREPARE stmt_create_drafts FROM @sql_create_drafts;
EXECUTE stmt_create_drafts;
DEALLOCATE PREPARE stmt_create_drafts;

SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'test_quiz_drafts') > 0,
  'OK: test_quiz_drafts ready',
  'FAIL: test_quiz_drafts not created'
) AS migration_result;
