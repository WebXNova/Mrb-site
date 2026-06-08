/**
 * Test ownership foundation (Phase 1C).
 *
 * Boolean check: may this student access this test?
 * Delegates course ownership to enrollments; test must be published and not deleted.
 */

import { mysqlPool } from '../config/mysql.js';
import { BLOCKING_ENROLLMENT_STATUSES } from '../errors/entitlement/index.js';
import { STUDENT_ELIGIBLE_TEST_STATUS } from '../constants/studentEligibleTest.constants.js';
import { StructuredLogger } from '../utils/requestId.js';
import { TestNotAccessibleError } from '../errors/testAttempt/TestAttemptErrors.js';

const logger = new StructuredLogger({ service: 'testOwnership' });

/** @type {readonly string[]} */
const BLOCKING_STATUS_PARAMS = BLOCKING_ENROLLMENT_STATUSES;

/**
 * Parameterized test ownership probe.
 * Placeholders: (studentId, testId, ...blockingEnrollmentStatuses)
 */
export const STUDENT_OWNS_TEST_SQL = `
  SELECT EXISTS(
    SELECT 1
    FROM tests t
    INNER JOIN enrollments e ON e.course_id = t.course_id
      AND e.user_id = ?
      AND e.access_status = 'active'
      AND e.status NOT IN (${BLOCKING_ENROLLMENT_STATUSES.map(() => '?').join(', ')})
    INNER JOIN users u ON u.id = e.user_id AND u.status = 'active'
    INNER JOIN courses c ON c.id = t.course_id AND c.is_active = 1
    WHERE t.id = ?
      AND t.deleted_at IS NULL
      AND t.status = ?
    LIMIT 1
  ) AS owns_test
`;

/**
 * @param {unknown} value
 * @param {'studentId' | 'testId'} label
 * @returns {number|null}
 */
function normalizeOptionalId(value, label) {
  if (value == null || value === '') {
    logger.debug('test ownership denied — invalid id', { [label]: value, reason: 'missing_id' });
    return null;
  }
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    logger.debug('test ownership denied — invalid id', { [label]: value, reason: 'invalid_id' });
    return null;
  }
  return id;
}

/** @param {unknown} raw */
function coerceExistsFlag(raw) {
  if (raw === true || raw === 1 || raw === '1') return true;
  if (typeof raw === 'bigint') return raw === 1n;
  if (Buffer.isBuffer(raw)) return raw[0] === 1;
  return false;
}

/**
 * Determine whether a student may access a specific test.
 *
 * Returns `false` when the test is missing, unpublished, deleted/archived, the course
 * is inactive, enrollment is not active, or on database failure. Never throws.
 *
 * @param {number|string|null|undefined} studentId
 * @param {number|string|null|undefined} testId
 * @param {{ executor?: import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection }} [options]
 * @returns {Promise<boolean>}
 */
export async function studentOwnsTest(studentId, testId, options = {}) {
  const uid = normalizeOptionalId(studentId, 'studentId');
  const tid = normalizeOptionalId(testId, 'testId');

  if (uid == null || tid == null) {
    return false;
  }

  const executor = options.executor ?? mysqlPool;
  const params = [uid, ...BLOCKING_STATUS_PARAMS, tid, STUDENT_ELIGIBLE_TEST_STATUS];

  try {
    const [rows] = await executor.query(STUDENT_OWNS_TEST_SQL, params);
    const owns = coerceExistsFlag(rows?.[0]?.owns_test);

    logger.debug('test ownership resolved', {
      studentId: uid,
      testId: tid,
      owns,
      reason: owns ? 'active_enrollment_and_published_test' : 'denied',
    });

    return owns;
  } catch (error) {
    logger.warn('test ownership check failed — denying access', {
      studentId: uid,
      testId: tid,
      reason: 'database_error',
      errorCode: error?.code ?? null,
      errorMessage: error?.message ?? 'unknown_error',
    });
    return false;
  }
}

/**
 * Fail-closed test ownership assert for mutating student test APIs.
 *
 * @param {number} studentId
 * @param {number} testId
 * @param {{ executor?: import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection, reason?: string }} [options]
 */
export async function assertStudentOwnsTest(studentId, testId, options = {}) {
  const owns = await studentOwnsTest(studentId, testId, options);
  if (!owns) {
    throw new TestNotAccessibleError({
      studentId,
      testId,
      reason: options.reason ?? 'not_authorized_for_test',
    });
  }
}
