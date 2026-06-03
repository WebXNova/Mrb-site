/**
 * Course Entitlement Engine (CEE) — authoritative requireEntitlement service.
 *
 * JWT establishes identity only; enrollment access_status = 'active' grants instructional access.
 */

import {
  assertCourseAccess,
  assertEntitlementGrantable,
  resolveActiveEntitlement,
} from '../../services/entitlement.service.js';
import { UnauthorizedError, EnrollmentNotFoundError } from '../../errors/entitlement/EntitlementErrors.js';

/**
 * @typedef {import('../../services/entitlement.service.js').EntitlementContext} EntitlementContext
 */

/**
 * Require a valid active entitlement for the authenticated user (fail-closed).
 * @param {number} userId
 * @param {{ courseId?: number }} [options] — when set, enforces course_id match
 * @returns {Promise<EntitlementContext>}
 */
export async function requireEntitlement(userId, options = {}) {
  const uid = Number(userId);
  if (!Number.isInteger(uid) || uid <= 0) {
    throw new UnauthorizedError({ reason: 'missing_user_id', context: 'cee_require_entitlement' });
  }

  const requestedCourseId = options.courseId != null ? Number(options.courseId) : null;

  if (requestedCourseId != null && Number.isInteger(requestedCourseId) && requestedCourseId > 0) {
    return assertCourseAccess(uid, requestedCourseId);
  }

  const entitlement = await resolveActiveEntitlement(uid);
  if (!entitlement) {
    throw new EnrollmentNotFoundError({ userId: uid, context: 'cee_require_entitlement' });
  }

  assertEntitlementGrantable(entitlement, { userId: uid, courseId: entitlement.courseId });
  return entitlement;
}

/**
 * Attach entitlement context onto the request for downstream handlers.
 * @param {import('express').Request} req
 * @param {EntitlementContext} entitlement
 */
export function attachEntitlementToRequest(req, entitlement) {
  req.entitlement = entitlement;
  req.cee = {
    entitlement,
    enrollmentId: entitlement.enrollmentId,
    courseId: entitlement.courseId,
    userId: entitlement.userId,
  };
}
