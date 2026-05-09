-- Remove stale verification rows older than retention window.
-- Run via cron (recommended every 15-60 minutes) or: npm run cleanup:email-verifications
DELETE FROM email_verifications
WHERE expires_at < (NOW() - INTERVAL 72 HOUR)
   OR (used_at IS NOT NULL AND used_at < (NOW() - INTERVAL 72 HOUR));

