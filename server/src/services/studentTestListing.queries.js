/**
 * Parameterized SQL for student test listing (Phase 1C).
 *
 * Architecture: Student → Owned Courses (enrollments) → Published Tests
 *
 * Discovery is enrollment-based. Admin-only (private) tests never appear.
 * Available (public) tests appear only for the student's actively enrolled course.
 * start_date / end_date are selected for display only — they are not list filters.
 *
 * Marks and attempt aggregates are loaded in batch for the page of test IDs only
 * (not via global GROUP BY over all test_questions / all student attempts).
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
    AND t.access_mode = 'public'
    AND t.test_access_type = 'course_locked'
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
 * Per-student attempt aggregates for a set of test IDs (authenticated listing).
 * Uses user_id only (index-friendly) — student portal attempts always set user_id.
 * Kept name + GROUP BY for listing verification / no-N+1 contract.
 */
export const STUDENT_TEST_ATTEMPT_AGGREGATE_JOIN_SQL = `
  SELECT
    a.test_id,
    COUNT(*) AS attempts_used,
    MAX(CASE WHEN a.status = 'in_progress' THEN a.id END) AS active_attempt_id
  FROM test_attempts a
  WHERE a.user_id = ?
    AND a.test_id IN (/* placeholders */)
  GROUP BY a.test_id
`;

/**
 * Marks + question counts for a set of test IDs only (not a global scan).
 */
export const STUDENT_TEST_TOTAL_MARKS_JOIN_SQL = `
  SELECT tq.test_id,
         COALESCE(SUM(COALESCE(tq.marks_override, qb.marks, 1)), 0) AS total_marks,
         COUNT(*) AS question_count
  FROM test_questions tq
  INNER JOIN question_bank qb ON qb.id = tq.question_id AND qb.deleted_at IS NULL
  WHERE tq.test_id IN (/* placeholders */)
  GROUP BY tq.test_id
`;

/**
 * Page eligible tests — lightweight list without global marks/attempt aggregates.
 * Params: studentId, ...blockingStatuses, publishedStatus, limit, offset
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
    t.public_slug,
    t.start_date,
    t.end_date,
    t.updated_at
  FROM tests t
  ${STUDENT_OWNED_COURSES_JOIN_SQL}
  ${STUDENT_ELIGIBLE_TEST_WHERE_SQL}
  ORDER BY t.updated_at DESC, t.id DESC
  LIMIT ? OFFSET ?
`;

/**
 * @param {number[]} testIds
 * @returns {{ sql: string, params: number[] } | null}
 */
export function buildStudentAttemptAggregatesForTestsSql(studentId, testIds) {
  const ids = [...new Set(testIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))];
  if (!ids.length) return null;
  const placeholders = ids.map(() => '?').join(',');
  return {
    sql: `
  SELECT
    a.test_id,
    COUNT(*) AS attempts_used,
    MAX(CASE WHEN a.status = 'in_progress' THEN a.id END) AS active_attempt_id
  FROM test_attempts a
  WHERE a.user_id = ?
    AND a.test_id IN (${placeholders})
  GROUP BY a.test_id
`,
    params: [studentId, ...ids],
  };
}

/**
 * @param {number[]} testIds
 * @returns {{ sql: string, params: number[] } | null}
 */
export function buildStudentTestMarksForTestsSql(testIds) {
  const ids = [...new Set(testIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))];
  if (!ids.length) return null;
  const placeholders = ids.map(() => '?').join(',');
  return {
    sql: `
  SELECT tq.test_id,
         COALESCE(SUM(COALESCE(tq.marks_override, qb.marks, 1)), 0) AS total_marks,
         COUNT(*) AS question_count
  FROM test_questions tq
  INNER JOIN question_bank qb ON qb.id = tq.question_id AND qb.deleted_at IS NULL
  WHERE tq.test_id IN (${placeholders})
  GROUP BY tq.test_id
`,
    params: ids,
  };
}

/**
 * @param {number} studentId
 * @param {number} limit
 * @param {number} offset
 * @returns {unknown[]}
 */
export function buildListStudentEligibleTestsParams(studentId, limit, offset) {
  return [studentId, ...STUDENT_OWNED_COURSES_BLOCKING_PARAMS, STUDENT_ELIGIBLE_TEST_STATUS, limit, offset];
}

/**
 * @param {number} studentId
 * @returns {unknown[]}
 */
export function buildStudentEligibleTestsBaseParams(studentId) {
  return [studentId, ...STUDENT_OWNED_COURSES_BLOCKING_PARAMS, STUDENT_ELIGIBLE_TEST_STATUS];
}
