/**
 * Question bank mutation authorization — ownership + course reassignment controls.
 */

import { mysqlPool } from '../config/mysql.js';
import { ApiError } from '../utils/apiError.js';
import {
  logTestValidationFailure,
  TEST_SECURITY_ACTIONS,
} from './testSecurityAudit.service.js';

/**
 * @param {number} questionId
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} [executor]
 */
export async function loadQuestionMutationRow(questionId, executor = mysqlPool) {
  const [rows] = await executor.query(
    `SELECT id, course_id, created_by
     FROM question_bank
     WHERE id = ? AND deleted_at IS NULL
     LIMIT 1`,
    [Number(questionId)]
  );
  return rows[0] ?? null;
}

/**
 * @param {number} questionId
 * @param {number} userId
 * @param {string} role
 * @param {{ targetCourseId?: number|null, executor?: import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection }} [options]
 */
export async function assertQuestionMutationAccess(questionId, userId, role, options = {}) {
  const uid = Number(userId);
  if (!Number.isInteger(uid) || uid <= 0) {
    throw new ApiError(401, 'Authenticated admin required', { code: 'UNAUTHORIZED' });
  }

  const executor = options.executor ?? mysqlPool;
  const row = await loadQuestionMutationRow(questionId, executor);
  if (!row) {
    throw new ApiError(404, 'Question not found', { code: 'QUESTION_NOT_FOUND' });
  }

  if (role === 'super_admin') {
    return row;
  }

  const ownerId = row.created_by == null ? null : Number(row.created_by);

  if (ownerId != null && ownerId !== uid) {
    logTestValidationFailure({
      testId: null,
      userId: uid,
      errorCode: 'FORBIDDEN',
      reason: 'QUESTION_MUTATION_OWNERSHIP_DENIED',
      action: TEST_SECURITY_ACTIONS.QUESTION_LINKING_REJECTION,
      metadata: { questionId: Number(questionId), createdBy: ownerId, role },
    });
    throw new ApiError(403, 'You do not have permission to modify this question.', {
      code: 'FORBIDDEN',
      questionId: Number(questionId),
    });
  }

  const targetCourseId =
    options.targetCourseId == null ? Number(row.course_id) : Number(options.targetCourseId);
  const currentCourseId = Number(row.course_id);

  if (
    Number.isInteger(targetCourseId) &&
    targetCourseId > 0 &&
    targetCourseId !== currentCourseId &&
    role !== 'super_admin'
  ) {
    logTestValidationFailure({
      testId: null,
      userId: uid,
      errorCode: 'FORBIDDEN',
      reason: 'QUESTION_COURSE_REASSIGNMENT_DENIED',
      action: TEST_SECURITY_ACTIONS.QUESTION_LINKING_REJECTION,
      metadata: {
        questionId: Number(questionId),
        fromCourseId: currentCourseId,
        toCourseId: targetCourseId,
      },
    });
    throw new ApiError(403, 'Question course reassignment requires super admin privileges.', {
      code: 'FORBIDDEN',
      questionId: Number(questionId),
    });
  }

  return row;
}
