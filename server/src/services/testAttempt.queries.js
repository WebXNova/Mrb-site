/**
 * Parameterized SQL for public / entitled test attempt creation.
 * Mirrors studentTestStart.queries.js required columns (student_id, attempt_number).
 */

import { TEST_AVAILABILITY_CREATE_WHERE_SQL } from './testAvailabilityWindow.queries.js';
import { TEST_RETAKE_CREATE_WHERE_SQL } from './testRetakePolicy.queries.js';

/** Params: courseId, testId */
export const LOCK_ENTITLED_TEST_FOR_START_SQL = `
  SELECT id, start_date, end_date, duration_minutes, max_attempts, allow_retake,
         shuffle_questions, shuffle_options, status
  FROM tests t
  WHERE t.id = ?
    AND t.course_id = ?
    AND t.status = 'published'
  LIMIT 1
  FOR UPDATE
`;

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
 * Placeholder order (14 total — must match SQL ? appearance left-to-right):
 *  1-5:  SELECT test_id, student_id, user_id, student_name, attempt_number
 *  6:    duration_minutes (INTERVAL)
 *  7-10: ip_address, user_agent, device_fingerprint, attempt_nonce
 *  11:   WHERE t.id
 *  12:   WHERE t.course_id
 *  13-14: retake guard (student_id, user_id)
 *
 * Use buildInsertEntitledTestAttemptParams() — do not hand-build this array.
 *
 * started_at and expires_at are derived from the same MySQL clock:
 *   expires_at = DATE_ADD(UTC_TIMESTAMP(), INTERVAL durationMinutes MINUTE)
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
    UTC_TIMESTAMP(),
    DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? MINUTE),
    UTC_TIMESTAMP(),
    ?, ?, ?, NULL, ?, 'DIRECT'
  FROM tests t
  WHERE t.id = ? AND t.course_id = ? AND t.status = 'published'
    ${TEST_AVAILABILITY_CREATE_WHERE_SQL}
    ${TEST_RETAKE_CREATE_WHERE_SQL}
  LIMIT 1
`;

/**
 * @param {{
 *   testId: number,
 *   courseId: number,
 *   studentId: number,
 *   studentName?: string|null,
 *   attemptNumber: number,
 *   durationMinutes: number,
 *   ipAddress?: string|null,
 *   userAgent?: string|null,
 *   deviceFingerprint: string,
 *   attemptNonce: string,
 * }} input
 * @returns {unknown[]}
 */
export function buildInsertEntitledTestAttemptParams(input) {
  return [
    Number(input.testId),
    Number(input.studentId),
    Number(input.studentId),
    input.studentName ?? null,
    Number(input.attemptNumber),
    Number(input.durationMinutes),
    input.ipAddress ?? null,
    input.userAgent ?? null,
    input.deviceFingerprint,
    input.attemptNonce,
    Number(input.testId),
    Number(input.courseId),
    Number(input.studentId),
    Number(input.studentId),
  ];
}
