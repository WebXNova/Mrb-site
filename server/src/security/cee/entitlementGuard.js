/**
 * CEE entitlement middleware — enrollment-backed access (not role-based).
 */

import { requireEntitlement, attachEntitlementToRequest } from './requireEntitlement.js';
import { assertStudentIdentity } from './identityGuard.js';
import { extractRequestedCourseId } from './courseIdExtractor.js';
import { auditEntitlementFailure } from './audit/entitlementAudit.js';

/**
 * Full CEE stack: identity → entitlement → attach req.cee
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export async function entitlementGuard(req, res, next) {
  try {
    await assertStudentIdentity(req, res, { requireVerified: true });

    const courseId = extractRequestedCourseId(req);
    const entitlement = await requireEntitlement(req.user.id, {
      courseId: courseId ?? undefined,
    });

    attachEntitlementToRequest(req, entitlement);
    return next();
  } catch (error) {
    auditEntitlementFailure(error, req, { context: 'cee.entitlementGuard' });
    return next(error);
  }
}

/**
 * Identity only (enrollment flows: create enrollment, start payment before access granted).
 */
export async function identityOnlyGuard(req, res, next) {
  try {
    await assertStudentIdentity(req, res, { requireVerified: false });
    return next();
  } catch (error) {
    return next(error);
  }
}
