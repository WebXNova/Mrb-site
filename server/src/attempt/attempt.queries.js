/**
 * Parameterized SQL for the attempt session core (read + expiry only).
 */

/** Active attempt for student + test (most recent if multiple — should not happen under uq_attempt). */
export const GET_ACTIVE_ATTEMPT_SQL = `
  SELECT
    id,
    test_id,
    student_id,
    user_id,
    status,
    started_at,
    expires_at,
    attempt_nonce
  FROM test_attempts
  WHERE test_id = ?
    AND student_id = ?
    AND status = 'in_progress'
  ORDER BY started_at DESC
  LIMIT 1
`;

/** Load attempt by primary key for access validation. */
export const GET_ATTEMPT_BY_ID_SQL = `
  SELECT
    id,
    test_id,
    student_id,
    user_id,
    status,
    started_at,
    expires_at,
    attempt_nonce
  FROM test_attempts
  WHERE id = ?
  LIMIT 1
`;

/**
 * Atomically mark attempt expired when server clock is past expires_at.
 * Only transitions from in_progress → expired.
 */
export const EXPIRE_ATTEMPT_IF_PAST_DEADLINE_SQL = `
  UPDATE test_attempts
  SET status = 'expired',
      completion_reason = 'expired',
      updated_at = CURRENT_TIMESTAMP
  WHERE id = ?
    AND status = 'in_progress'
    AND expires_at IS NOT NULL
    AND expires_at < NOW()
`;

/** Authoritative expiry probe using MySQL clock (never client time). */
export const CHECK_ATTEMPT_EXPIRED_SQL = `
  SELECT
    id,
    test_id,
    student_id,
    user_id,
    status,
    started_at,
    expires_at,
    attempt_nonce,
    CASE
      WHEN expires_at IS NOT NULL AND expires_at < NOW() THEN 1
      ELSE 0
    END AS is_past_expiry
  FROM test_attempts
  WHERE id = ?
  LIMIT 1
`;
