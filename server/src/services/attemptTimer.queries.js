/**
 * Timer enforcement SQL (server controlled).
 */

export const LOAD_ATTEMPT_TIMER_SQL = `
  SELECT id, status, expires_at
  FROM test_attempts
  WHERE id = ?
  LIMIT 1
`;

/**
 * Expire attempt when `NOW() > expires_at` (strict).
 *
 * Note: uses `expires_at < NOW()` (not <=) so expiry happens only after the timestamp passes.
 *
 * Sets:
 * - status = 'expired'
 * - completion_reason = 'expired'
 */
export const EXPIRE_ATTEMPT_IF_EXPIRED_SQL = `
  UPDATE test_attempts
  SET status = 'expired',
      completion_reason = 'expired',
      updated_at = CURRENT_TIMESTAMP
  WHERE id = ?
    AND status = 'in_progress'
    AND expires_at IS NOT NULL
    AND expires_at < NOW()
`;

