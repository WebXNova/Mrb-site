-- Remove expired sessions OR soft-revoked rows older than N days (tune INTERVAL as needed).
-- Run via cron (e.g. daily 03:00) or: npm run cleanup:auth-sessions
DELETE FROM auth_sessions
WHERE expires_at < NOW()
   OR (revoked_at IS NOT NULL AND revoked_at < (NOW() - INTERVAL 30 DAY));
