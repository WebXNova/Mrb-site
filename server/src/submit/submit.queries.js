/**
 * Submit module — parameterized SQL (lock engine).
 */

/** Params: attemptId */
export const LOCK_ATTEMPT_FOR_UPDATE_SQL = `
  SELECT
    id,
    test_id,
    student_id,
    user_id,
    status,
    started_at,
    expires_at,
    submitted_at
  FROM test_attempts
  WHERE id = ?
  LIMIT 1
  FOR UPDATE
`;

/**
 * Atomic active → submitted transition.
 * Params: attemptId, studentId
 */
export const LOCK_ATTEMPT_SUBMIT_SQL = `
  UPDATE test_attempts
  SET status = 'submitted',
      submitted_at = CURRENT_TIMESTAMP,
      completion_reason = 'submitted',
      updated_at = CURRENT_TIMESTAMP
  WHERE id = ?
    AND student_id = ?
    AND status = 'in_progress'
    AND expires_at IS NOT NULL
    AND expires_at >= NOW()
`;

/** Params: resultId, attemptId, studentId */
export const LINK_ATTEMPT_RESULT_SQL = `
  UPDATE test_attempts
  SET result_id = ?,
      updated_at = CURRENT_TIMESTAMP
  WHERE id = ?
    AND student_id = ?
    AND status = 'submitted'
`;
