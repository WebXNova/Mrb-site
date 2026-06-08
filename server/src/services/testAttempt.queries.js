/**
 * Parameterized SQL for public / entitled test attempt creation.
 * Mirrors studentTestStart.queries.js required columns (student_id, attempt_number).
 */

/** Params: testId, courseId, studentId, studentId */
export const COUNT_ENTITLED_STUDENT_ATTEMPTS_SQL = `
  SELECT COUNT(*) AS total
  FROM test_attempts a
  INNER JOIN tests t ON t.id = a.test_id AND t.course_id = ?
  WHERE a.test_id = ?
    AND (a.student_id = ? OR a.user_id = ?)
`;

/** Params: courseId, testId, studentId, studentId */
export const LOCK_ACTIVE_ENTITLED_ATTEMPT_SQL = `
  SELECT a.id, a.attempt_nonce, a.started_at, a.expires_at
  FROM test_attempts a
  INNER JOIN tests t ON t.id = a.test_id AND t.course_id = ?
  WHERE a.test_id = ?
    AND a.status = 'in_progress'
    AND (a.student_id = ? OR a.user_id = ?)
  ORDER BY a.id DESC
  LIMIT 1
  FOR UPDATE
`;

/** Params: testId, studentId */
export const NEXT_ENTITLED_ATTEMPT_NUMBER_SQL = `
  SELECT COALESCE(MAX(attempt_number), 0) + 1 AS next_attempt
  FROM test_attempts
  WHERE test_id = ?
    AND student_id = ?
  FOR UPDATE
`;

/**
 * Params:
 * testId, studentId, userId, studentName, attemptNumber, durationMinutes,
 * ipAddress, userAgent, deviceFingerprint, attemptNonce,
 * testId, courseId
 *
 * started_at and expires_at are derived from the same MySQL clock:
 *   expires_at = DATE_ADD(CURRENT_TIMESTAMP, INTERVAL durationMinutes MINUTE)
 */
export const INSERT_ENTITLED_TEST_ATTEMPT_SQL = `
  INSERT INTO test_attempts (
    test_id,
    student_id,
    user_id,
    student_name,
    attempt_number,
    status,
    started_at,
    expires_at,
    last_activity_at,
    ip_address,
    user_agent,
    device_fingerprint,
    used_code_hash,
    attempt_nonce,
    access_code_label
  )
  SELECT
    ?, ?, ?, ?, ?, 'in_progress',
    CURRENT_TIMESTAMP,
    DATE_ADD(CURRENT_TIMESTAMP, INTERVAL ? MINUTE),
    CURRENT_TIMESTAMP,
    ?, ?, ?, NULL, ?, 'DIRECT'
  FROM tests t
  WHERE t.id = ? AND t.course_id = ? AND t.status = 'published'
  LIMIT 1
`;
