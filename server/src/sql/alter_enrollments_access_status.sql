-- =============================================================================
-- enrollments.access_status — manual migration (run one branch after BACKUP)
-- Target: ENUM('active', 'inactive', 'revoked') NOT NULL DEFAULT 'inactive'
-- =============================================================================
--
-- A) Column does NOT exist yet — uncomment and run:
--
-- ALTER TABLE enrollments
--   ADD COLUMN access_status ENUM('active', 'inactive', 'revoked') NOT NULL DEFAULT 'inactive'
--   AFTER status;
--
-- B) Column exists but is old (e.g. ENUM('inactive','active') or missing 'revoked') — run:
--
ALTER TABLE enrollments
  MODIFY COLUMN access_status ENUM('active', 'inactive', 'revoked') NOT NULL DEFAULT 'inactive';
--
-- C) Index for access queries — run only if idx_enrollments_user_access is missing:
--
-- ALTER TABLE enrollments ADD KEY idx_enrollments_user_access (user_id, access_status);
