/**
 * Parameterized SQL for student test listing (Phase 1C).
 *
 * Architecture: Student → Owned Courses (enrollments) → Published Tests
 */

import { BLOCKING_ENROLLMENT_STATUSES } from '../errors/entitlement/index.js';
import { STUDENT_ELIGIBLE_TEST_STATUS } from '../constants/studentEligibleTest.constants.js';

/** Shared enrollment ownership join — binds studentId + blocking enrollment statuses. */
export const STUDENT_OWNED_COURSES_JOIN_SQL = `
  INNER JOIN enrollments e ON e.course_id = t.course_id
    AND e.user_id = ?
    AND e.access_status = 'active'
    AND e.status NOT IN (${BLOCKING_ENROLLMENT_STATUSES.map(() => '?').join(', ')})
  INNER JOIN users u ON u.id = e.user_id AND u.status = 'active'
  INNER JOIN courses c ON c.id = t.course_id AND c.is_active = 1
`;

/** @type {readonly string[]} */
export const STUDENT_OWNED_COURSES_BLOCKING_PARAMS = BLOCKING_ENROLLMENT_STATUSES;

export const STUDENT_ELIGIBLE_TEST_WHERE_SQL = `
  WHERE t.deleted_at IS NULL
    AND t.status = ?
`;

/**
 * Count eligible tests for a student across all owned courses.
 * Params: studentId, ...blockingStatuses, publishedStatus
 */
export const COUNT_STUDENT_ELIGIBLE_TESTS_SQL = `
  SELECT COUNT(*) AS total
  FROM tests t
  ${STUDENT_OWNED_COURSES_JOIN_SQL}
  ${STUDENT_ELIGIBLE_TEST_WHERE_SQL}
`;

/**
 * Per-student attempt aggregates — one grouped scan (uses idx_user / idx_student / idx_test).
 * Placeholders: (studentId, studentId) for user_id OR student_id match.
 */
export const STUDENT_TEST_ATTEMPT_AGGREGATE_JOIN_SQL = `
  LEFT JOIN (
    SELECT
      a.test_id,
      COUNT(*) AS attempts_used,
      MAX(CASE WHEN a.status = 'in_progress' THEN a.id END) AS active_attempt_id
    FROM test_attempts a
    WHERE a.user_id = ? OR a.student_id = ?
    GROUP BY a.test_id
  ) att ON att.test_id = t.id
`;

export const STUDENT_TEST_TOTAL_MARKS_JOIN_SQL = `
  LEFT JOIN (
    SELECT tq.test_id,
           COALESCE(SUM(COALESCE(tq.marks_override, qb.marks, 1)), 0) AS total_marks
    FROM test_questions tq
    INNER JOIN question_bank qb ON qb.id = tq.question_id AND qb.deleted_at IS NULL
    GROUP BY tq.test_id
  ) tm ON tm.test_id = t.id
`;

/**
 * Page eligible tests with attempt status aggregates for a student.
 * Params: studentId, ...blockingStatuses, publishedStatus, studentId, studentId, limit, offset
 */
export const LIST_STUDENT_ELIGIBLE_TESTS_SQL = `
  SELECT
    t.id,
    t.title,
    t.category,
    t.duration_minutes,
    t.max_attempts,
    t.allow_retake,
    t.passing_marks,
    COALESCE(tm.total_marks, 0) AS total_marks,
    t.public_slug,
    t.start_date,
    t.end_date,
    t.updated_at,
    COALESCE(att.attempts_used, 0) AS attempts_used,
    att.active_attempt_id
  FROM tests t
  ${STUDENT_OWNED_COURSES_JOIN_SQL}
  ${STUDENT_TEST_ATTEMPT_AGGREGATE_JOIN_SQL}
  ${STUDENT_TEST_TOTAL_MARKS_JOIN_SQL}
  ${STUDENT_ELIGIBLE_TEST_WHERE_SQL}
  ORDER BY t.updated_at DESC, t.id DESC
  LIMIT ? OFFSET ?
`;

/**
 * @param {number} studentId
 * @param {number} limit
 * @param {number} offset
 * @returns {unknown[]}
 */
export function buildListStudentEligibleTestsParams(studentId, limit, offset) {
  return [...buildStudentEligibleTestsBaseParams(studentId), studentId, studentId, limit, offset];
}

/**
 * @param {number} studentId
 * @returns {unknown[]}
 */
export function buildStudentEligibleTestsBaseParams(studentId) {
  return [studentId, ...STUDENT_OWNED_COURSES_BLOCKING_PARAMS, STUDENT_ELIGIBLE_TEST_STATUS];
}
