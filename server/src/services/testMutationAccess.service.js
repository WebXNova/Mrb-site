/**
 * Test mutation authorization — ownership gate for wizard, publish, delete, export.
 *
 * super_admin: full access
 * admin: must own test (created_by) unless legacy row has null created_by
 * teacher: must own test (for delegated staff routes)
 */

import { mysqlPool } from '../config/mysql.js';
import { AppError } from '../errors/base/AppError.js';
import { FORBIDDEN, NOT_FOUND } from '../errors/codes/ErrorCodes.js';
import { isAdminRole } from '../utils/isAdminRole.js';
import { isQuestionBankStaffRole } from '../utils/isQuestionBankStaffRole.js';
import {
  logTestValidationFailure,
  TEST_SECURITY_ACTIONS,
} from './testSecurityAudit.service.js';

/**
 * @param {number} testId
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} [executor]
 */
async function loadTestMutationRow(testId, executor = mysqlPool) {
  const [rows] = await executor.query(
    `SELECT id, course_id, created_by, status, title
     FROM tests
     WHERE id = ? AND deleted_at IS NULL
     LIMIT 1`,
    [Number(testId)]
  );
  return rows[0] ?? null;
}

/**
 * @param {number} testId
 * @param {number} userId
 * @param {string} role
 * @param {{
 *   action?: string,
 *   targetCourseId?: number|null,
 *   executor?: import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection,
 * }} [options]
 */
export async function assertTestMutationAccess(testId, userId, role, options = {}) {
  const uid = Number(userId);
  if (!Number.isInteger(uid) || uid <= 0) {
    throw new AppError({
      message: 'Authentication required.',
      errorCode: 'UNAUTHORIZED',
      httpStatus: 401,
      isOperational: true,
    });
  }

  if (!isQuestionBankStaffRole(role) && !isAdminRole(role)) {
    throw new AppError({
      message: 'Test mutation requires admin or teacher permissions.',
      errorCode: FORBIDDEN,
      httpStatus: 403,
      isOperational: true,
      metadata: { role },
    });
  }

  const executor = options.executor ?? mysqlPool;
  const row = await loadTestMutationRow(testId, executor);
  if (!row) {
    throw new AppError({
      message: 'Test was not found.',
      errorCode: NOT_FOUND,
      httpStatus: 404,
      isOperational: true,
      metadata: { testId: Number(testId) },
    });
  }

  const currentCourseId = Number(row.course_id);
  const targetCourseId =
    options.targetCourseId == null ? currentCourseId : Number(options.targetCourseId);

  if (
    role !== 'super_admin' &&
    Number.isInteger(targetCourseId) &&
    targetCourseId > 0 &&
    targetCourseId !== currentCourseId
  ) {
    logTestValidationFailure({
      testId: Number(testId),
      userId: uid,
      errorCode: FORBIDDEN,
      reason: 'TEST_COURSE_REASSIGNMENT_DENIED',
      action: TEST_SECURITY_ACTIONS.INVALID_TEST_MUTATION,
      metadata: { fromCourseId: currentCourseId, toCourseId: targetCourseId, role },
    });
    throw new AppError({
      message: 'Test course reassignment requires super admin privileges.',
      errorCode: FORBIDDEN,
      httpStatus: 403,
      isOperational: true,
      metadata: { testId: Number(testId), courseId: currentCourseId },
    });
  }

  if (role === 'super_admin') {
    return row;
  }

  const ownerId = row.created_by == null ? null : Number(row.created_by);
  const ownsTest = ownerId == null || ownerId === uid;

  if (isAdminRole(role)) {
    if (!ownsTest) {
      logTestValidationFailure({
        testId: Number(testId),
        userId: uid,
        errorCode: FORBIDDEN,
        reason: 'TEST_MUTATION_OWNERSHIP_DENIED',
        action: TEST_SECURITY_ACTIONS.INVALID_TEST_MUTATION,
        metadata: { role, createdBy: ownerId, action: options.action ?? 'write' },
      });
      throw new AppError({
        message: 'You do not have permission to modify this test.',
        errorCode: FORBIDDEN,
        httpStatus: 403,
        isOperational: true,
        metadata: { testId: Number(testId), createdBy: ownerId },
      });
    }
    return row;
  }

  if (!ownsTest || ownerId == null) {
    throw new AppError({
      message: 'You do not have permission to modify this test.',
      errorCode: FORBIDDEN,
      httpStatus: 403,
      isOperational: true,
      metadata: { testId: Number(testId), createdBy: ownerId },
    });
  }

  return row;
}

/**
 * Completeness / publish-readiness visibility — same ownership gate as publish.
 * Regular admins may only inspect tests they own; super_admin may inspect all.
 *
 * @param {number} testId
 * @param {number} userId
 * @param {string} role
 * @param {Parameters<typeof assertTestMutationAccess>[3]} [options]
 */
export async function assertTestCompletenessAccess(testId, userId, role, options = {}) {
  return assertTestMutationAccess(testId, userId, role, {
    ...options,
    action: options.action ?? 'completeness_read',
  });
}

/**
 * Read access for composed questions / test preview (no mutation).
 * Admins may read any test; teachers must own the test.
 *
 * @param {number} testId
 * @param {number} userId
 * @param {string} role
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} [executor]
 */
export async function assertTestReadAccess(testId, userId, role, executor = mysqlPool) {
  const uid = Number(userId);
  if (!Number.isInteger(uid) || uid <= 0) {
    throw new AppError({
      message: 'Authentication required.',
      errorCode: 'UNAUTHORIZED',
      httpStatus: 401,
      isOperational: true,
    });
  }

  if (!isQuestionBankStaffRole(role) && !isAdminRole(role)) {
    throw new AppError({
      message: 'Test read access requires admin or teacher permissions.',
      errorCode: FORBIDDEN,
      httpStatus: 403,
      isOperational: true,
      metadata: { role },
    });
  }

  const row = await loadTestMutationRow(testId, executor);
  if (!row) {
    throw new AppError({
      message: 'Test was not found.',
      errorCode: NOT_FOUND,
      httpStatus: 404,
      isOperational: true,
      metadata: { testId: Number(testId) },
    });
  }

  if (isAdminRole(role)) {
    return row;
  }

  const ownerId = row.created_by == null ? null : Number(row.created_by);
  if (ownerId != null && ownerId !== uid) {
    throw new AppError({
      message: 'You do not have permission to view this test.',
      errorCode: FORBIDDEN,
      httpStatus: 403,
      isOperational: true,
      metadata: { testId: Number(testId), createdBy: ownerId },
    });
  }

  return row;
}
