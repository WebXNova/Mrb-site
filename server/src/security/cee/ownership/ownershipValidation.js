/**
 * CEE service-layer ownership validation — controllers are not trusted.
 */

import { emitSecurityAuditEvent } from '../audit/securityAuditLogger.js';
import { CEE_AUDIT_ACTIONS, CEE_AUDIT_VIOLATION_TYPES } from '../audit/auditSchema.js';
import {
  assertCourseAccess,
  resolveActiveEntitlement,
} from '../../../services/entitlement.service.js';
import { scopedQuery } from '../db/scopedQuery.js';
import {
  AttemptNotFoundError,
  AttemptNotOwnedError,
  CourseScopeViolationError,
} from '../../../errors/testAttempt/TestAttemptErrors.js';
import { EnrollmentNotFoundError } from '../../../errors/entitlement/EntitlementErrors.js';

/**
 * @typedef {import('../../../services/entitlement.service.js').EntitlementContext} EntitlementContext
 */

/**
 * @param {object} payload
 */
function auditOwnershipViolation(payload) {
  emitSecurityAuditEvent({
    action: CEE_AUDIT_ACTIONS.ENTITLEMENT_DENIED,
    violationType: CEE_AUDIT_VIOLATION_TYPES.ENTITLEMENT_FAILURE,
    outcome: 'denied',
    reason: payload.reason,
    context: payload.context ?? 'cee.ownership',
    route: payload.route ?? null,
    userId: payload.userId ?? null,
    requestId: payload.requestId ?? null,
    tables: payload.tables ?? [],
    errorCode: payload.errorCode ?? 'OWNERSHIP_VIOLATION',
    skipPersist: false,
  });
}

/**
 * @param {number} userId
 * @param {string} [context]
 * @returns {Promise<EntitlementContext>}
 */
export async function requireActiveEntitlement(userId, context = 'cee.ownership') {
  const resolved = await resolveActiveEntitlement(userId);
  if (!resolved) {
    auditOwnershipViolation({
      reason: 'no_active_entitlement',
      context,
      userId,
      errorCode: 'ENROLLMENT_NOT_FOUND',
    });
    throw new EnrollmentNotFoundError({ userId, context });
  }
  return resolved;
}

/**
 * @param {number} userId
 * @param {number} courseId
 * @param {string} [context]
 * @returns {Promise<EntitlementContext>}
 */
export async function requireEntitlementForCourse(userId, courseId, context = 'cee.ownership') {
  try {
    return await assertCourseAccess(userId, courseId);
  } catch (error) {
    auditOwnershipViolation({
      reason: 'course_access_denied',
      context,
      userId,
      errorCode: error?.errorCode ?? 'COURSE_ACCESS_DENIED',
    });
    throw error;
  }
}

/**
 * @param {object} input
 * @param {number} input.attemptId
 * @param {number} input.userId
 * @param {EntitlementContext} input.entitlement
 * @param {string} [input.context]
 * @param {import('mysql2/promise').PoolConnection} [input.connection]
 */
export async function assertAttemptOwnership(input) {
  const { attemptId, userId, entitlement, context = 'ownership.assertAttempt', connection } = input;
  const db = scopedQuery(
    {
      courseId: entitlement.courseId,
      context,
      userId,
    },
    connection
  );

  const row = await db.first(
    `SELECT a.id, a.user_id, a.test_id, t.course_id
     FROM test_attempts a
     INNER JOIN tests t ON t.id = a.test_id AND t.course_id = ?
     WHERE a.id = ?
     LIMIT 1`,
    [entitlement.courseId, attemptId]
  );

  if (!row) {
    auditOwnershipViolation({
      reason: 'attempt_not_found_or_out_of_scope',
      context,
      userId,
      tables: ['test_attempts', 'tests'],
    });
    throw new AttemptNotFoundError({ attemptId, userId, courseId: entitlement.courseId });
  }

  if (Number(row.user_id) !== Number(userId)) {
    auditOwnershipViolation({
      reason: 'attempt_user_mismatch',
      context,
      userId,
      tables: ['test_attempts'],
    });
    throw new AttemptNotOwnedError({ attemptId, userId, ownerId: row.user_id });
  }

  if (Number(row.course_id) !== Number(entitlement.courseId)) {
    auditOwnershipViolation({
      reason: 'attempt_course_mismatch',
      context,
      userId,
      tables: ['tests'],
    });
    throw new CourseScopeViolationError({
      attemptId,
      expectedCourseId: entitlement.courseId,
      actualCourseId: row.course_id,
    });
  }

  return row;
}

/**
 * @param {object} input
 * @param {number} input.attemptId
 * @param {number} input.userId
 * @param {EntitlementContext} input.entitlement
 * @param {string} [input.context]
 */
export async function assertResultOwnership(input) {
  await assertAttemptOwnership({
    attemptId: input.attemptId,
    userId: input.userId,
    entitlement: input.entitlement,
    context: input.context ?? 'ownership.assertResult',
    connection: input.connection,
  });
}

/**
 * @param {object} input
 * @param {number} input.userId
 * @param {string} input.namespace
 * @param {string} input.filename
 * @param {EntitlementContext} input.entitlement
 */
export function assertUploadFilenameOwnership(input) {
  const { userId, namespace, filename, entitlement } = input;
  if (namespace === 'student-qa') {
    const prefix = `${userId}-`;
    if (!String(filename || '').startsWith(prefix)) {
      auditOwnershipViolation({
        reason: 'upload_filename_user_mismatch',
        context: 'ownership.upload',
        userId,
        tables: ['uploads'],
      });
      throw new CourseScopeViolationError({
        reason: 'upload_not_owned',
        userId,
        filename,
        courseId: entitlement.courseId,
      });
    }
  }
}
