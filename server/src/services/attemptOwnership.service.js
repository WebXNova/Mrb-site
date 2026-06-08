/**
 * Attempt ownership checks (Phase 2A).
 */

import { mysqlPool } from '../config/mysql.js';
import { StructuredLogger } from '../utils/requestId.js';
import { AttemptNotFoundError } from '../errors/testAttempt/TestAttemptErrors.js';

const logger = new StructuredLogger({ service: 'attemptOwnership' });

export const STUDENT_OWNS_ATTEMPT_SQL = `
  SELECT EXISTS(
    SELECT 1
    FROM test_attempts a
    INNER JOIN tests t ON t.id = a.test_id AND t.deleted_at IS NULL
    INNER JOIN enrollments e ON e.course_id = t.course_id
      AND e.user_id = ?
      AND e.access_status = 'active'
    WHERE a.id = ?
      AND (a.user_id = ? OR a.student_id = ?)
    LIMIT 1
  ) AS owns_attempt
`;

function normalizeOptionalId(value, label) {
  if (value == null || value === '') return null;
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) return null;
  return id;
}

function coerceExistsFlag(raw) {
  if (raw === true || raw === 1 || raw === '1') return true;
  if (typeof raw === 'bigint') return raw === 1n;
  if (Buffer.isBuffer(raw)) return raw[0] === 1;
  return false;
}

/**
 * @param {number|string|null|undefined} studentId
 * @param {number|string|null|undefined} attemptId
 * @param {{ executor?: import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection }} [options]
 * @returns {Promise<boolean>}
 */
export async function studentOwnsAttempt(studentId, attemptId, options = {}) {
  const uid = normalizeOptionalId(studentId, 'studentId');
  const aid = normalizeOptionalId(attemptId, 'attemptId');

  if (uid == null || aid == null) {
    return false;
  }

  const executor = options.executor ?? mysqlPool;

  try {
    const [rows] = await executor.query(STUDENT_OWNS_ATTEMPT_SQL, [uid, aid, uid, uid]);
    const owns = coerceExistsFlag(rows?.[0]?.owns_attempt);
    logger.debug('attempt ownership resolved', { studentId: uid, attemptId: aid, owns });
    return owns;
  } catch (error) {
    logger.warn('attempt ownership check failed — denying access', {
      studentId: uid,
      attemptId: aid,
      errorMessage: error?.message ?? 'unknown_error',
    });
    return false;
  }
}

/**
 * Fail-closed attempt ownership assert for student attempt APIs.
 *
 * @param {number} studentId
 * @param {number} attemptId
 * @param {{ executor?: import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection }} [options]
 */
export async function assertStudentOwnsAttempt(studentId, attemptId, options = {}) {
  const owns = await studentOwnsAttempt(studentId, attemptId, options);
  if (!owns) {
    throw new AttemptNotFoundError({
      studentId,
      attemptId,
      reason: 'not_authorized_for_attempt',
    });
  }
}
