/**
 * Course ownership foundation (Phase 1A).
 *
 * Boolean check: does this student currently own (have active access to) a course?
 * Source of truth: enrollments (+ users, courses integrity guards).
 *
 * For fail-closed instructional gates use entitlement.service.assertCourseAccess().
 */

import { mysqlPool } from '../config/mysql.js';
import {
  BLOCKING_ENROLLMENT_STATUSES,
  GRANTING_ACCESS_STATUSES,
} from '../errors/entitlement/index.js';
import { StructuredLogger } from '../utils/requestId.js';

const logger = new StructuredLogger({ service: 'courseOwnership' });

/**
 * Parameterized ownership probe — enrollments.access_status is the CEE source of truth.
 * Joins users/courses to reject missing, suspended, or inactive catalog rows safely.
 *
 * Placeholders: (studentId, courseId)
 */
export const STUDENT_OWNS_COURSE_SQL = `
  SELECT EXISTS(
    SELECT 1
    FROM enrollments e
    INNER JOIN users u ON u.id = e.user_id
    INNER JOIN courses c ON c.id = e.course_id
    WHERE e.user_id = ?
      AND e.course_id = ?
      AND e.access_status = 'active'
      AND e.status NOT IN (${BLOCKING_ENROLLMENT_STATUSES.map(() => '?').join(', ')})
      AND u.status = 'active'
      AND c.is_active = 1
    LIMIT 1
  ) AS owns_course
`;

/** @type {readonly string[]} */
const BLOCKING_STATUS_PARAMS = BLOCKING_ENROLLMENT_STATUSES;

/**
 * Normalize a student or course id. Invalid values become null (caller returns false).
 * @param {unknown} value
 * @param {'studentId' | 'courseId'} label
 * @returns {number|null}
 */
function normalizeOptionalId(value, label) {
  if (value == null || value === '') {
    logger.debug('course ownership denied — invalid id', { [label]: value, reason: 'missing_id' });
    return null;
  }

  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    logger.debug('course ownership denied — invalid id', { [label]: value, reason: 'invalid_id' });
    return null;
  }

  return id;
}

/**
 * Coerce MySQL EXISTS result to boolean across drivers (0/1, Buffer, bigint).
 * @param {unknown} raw
 * @returns {boolean}
 */
function coerceExistsFlag(raw) {
  if (raw === true || raw === 1 || raw === '1') return true;
  if (typeof raw === 'bigint') return raw === 1n;
  if (Buffer.isBuffer(raw)) return raw[0] === 1;
  return false;
}

/**
 * Determine whether a student has active, grantable access to a course.
 *
 * Returns `false` for missing users, missing/inactive courses, inactive/revoked/rejected
 * enrollments, invalid ids, and database failures. Never throws on runtime/data errors.
 *
 * @param {number|string|null|undefined} studentId — users.id (student account)
 * @param {number|string|null|undefined} courseId — courses.id
 * @param {{ executor?: import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection }} [options]
 * @returns {Promise<boolean>}
 */
export async function studentOwnsCourse(studentId, courseId, options = {}) {
  const uid = normalizeOptionalId(studentId, 'studentId');
  const cid = normalizeOptionalId(courseId, 'courseId');

  if (uid == null || cid == null) {
    return false;
  }

  if (!GRANTING_ACCESS_STATUSES.includes('active')) {
    logger.error('course ownership misconfiguration — no granting access statuses', {
      grantingStatuses: GRANTING_ACCESS_STATUSES,
    });
    return false;
  }

  const executor = options.executor ?? mysqlPool;
  const params = [uid, cid, ...BLOCKING_STATUS_PARAMS];

  try {
    const [rows] = await executor.query(STUDENT_OWNS_COURSE_SQL, params);
    const owns = coerceExistsFlag(rows?.[0]?.owns_course);

    logger.debug('course ownership resolved', {
      studentId: uid,
      courseId: cid,
      owns,
      reason: owns ? 'active_enrollment' : 'no_active_enrollment',
    });

    return owns;
  } catch (error) {
    logger.warn('course ownership check failed — denying access', {
      studentId: uid,
      courseId: cid,
      reason: 'database_error',
      errorCode: error?.code ?? null,
      errorMessage: error?.message ?? 'unknown_error',
    });
    return false;
  }
}
