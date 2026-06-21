/**
 * Parameterized SQL for POST /student/tests/:testId/start (Phase 2A).
 */

import { TEST_AVAILABILITY_CREATE_WHERE_SQL } from './testAvailabilityWindow.queries.js';
import { TEST_RETAKE_CREATE_WHERE_SQL } from './testRetakePolicy.queries.js';

export const LOAD_TEST_BY_ID_SQL = `
  SELECT
    id,
    course_id,
    status,
    deleted_at,
    duration_minutes,
    max_attempts,
    allow_retake,
    shuffle_questions,
    shuffle_options,
    start_date,
    end_date
  FROM tests
  WHERE id = ?
  LIMIT 1
`;

export const LOCK_TEST_BY_ID_SQL = `
  SELECT
    id,
    course_id,
    status,
    deleted_at,
    duration_minutes,
    max_attempts,
    allow_retake,
    shuffle_questions,
    shuffle_options,
    start_date,
    end_date
  FROM tests
  WHERE id = ?
  LIMIT 1
  FOR UPDATE
`;

/** Params: testId, studentId, studentId */
export const LOCK_ACTIVE_ATTEMPT_SQL = `
  SELECT id, started_at, expires_at
  FROM test_attempts
  WHERE test_id = ?
    AND status = 'in_progress'
    AND (user_id = ? OR student_id = ?)
  ORDER BY id DESC
  LIMIT 1
  FOR UPDATE
`;

/** Params: testId, studentId, studentId */
export const COUNT_STUDENT_TEST_ATTEMPTS_SQL = `
  SELECT COUNT(*) AS total
  FROM test_attempts
  WHERE test_id = ?
    AND (user_id = ? OR student_id = ?)
`;

/** Params: testId, studentId */
export const NEXT_ATTEMPT_NUMBER_SQL = `
  SELECT COALESCE(MAX(attempt_number), 0) + 1 AS next_attempt
  FROM test_attempts
  WHERE test_id = ?
    AND student_id = ?
  FOR UPDATE
`;

/** Params: testId, studentId, studentId, attemptNumber, durationMinutes, ip, ua, studentId, studentId, testId */
export const INSERT_TEST_ATTEMPT_SQL = `
  INSERT INTO test_attempts (
    test_id,
    student_id,
    user_id,
    attempt_number,
    status,
    started_at,
    expires_at,
    last_activity_at,
    ip_address,
    user_agent,
    access_code_label
  )
  SELECT
    ?, ?, ?, ?, 'in_progress',
    UTC_TIMESTAMP(),
    DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? MINUTE),
    UTC_TIMESTAMP(),
    ?, ?, 'DIRECT'
  FROM tests t
  WHERE t.id = ?
    AND t.deleted_at IS NULL
    AND t.status = 'published'
    ${TEST_AVAILABILITY_CREATE_WHERE_SQL}
    ${TEST_RETAKE_CREATE_WHERE_SQL}
  LIMIT 1
`;
