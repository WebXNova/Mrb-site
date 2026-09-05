/**
 * CEE entitlement middleware — enrollment-backed access (not role-based).
 *
 * Grants instructional access when access_status = 'active'.
 * courses.admission_status does not affect content access for enrolled students.
 */

import { requireEntitlement, attachEntitlementToRequest } from './requireEntitlement.js';
import { assertStudentIdentity } from './identityGuard.js';
import { extractRequestedCourseId } from './courseIdExtractor.js';
import {
  auditEntitlementFailure,
  auditEntitlementGranted,
} from './audit/entitlementAudit.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

/**
 * Full CEE stack: identity → entitlement → attach req.cee → audit grant
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export const entitlementGuard = asyncHandler(async function entitlementGuard(req, res, next) {
  try {
    await assertStudentIdentity(req, res, { requireVerified: true });

    const courseId = extractRequestedCourseId(req);
    const entitlement = await requireEntitlement(req.user.id, {
      courseId: courseId ?? undefined,
    });

    attachEntitlementToRequest(req, entitlement);
    try {
      await auditEntitlementGranted(entitlement, req, { context: 'cee.entitlementGuard' });
    } catch (auditError) {
      console.error({
        tag: '[cee.entitlementGuard]',
        message: 'grant_audit_failed',
        err: auditError instanceof Error ? auditError.message : String(auditError),
      });
    }
    return next();
  } catch (error) {
    try {
      await auditEntitlementFailure(error, req, { context: 'cee.entitlementGuard' });
    } catch (auditError) {
      console.error({
        tag: '[cee.entitlementGuard]',
        message: 'failure_audit_failed',
        err: auditError instanceof Error ? auditError.message : String(auditError),
      });
    }
    return next(error);
  }
});

/**
 * Identity only (enrollment flows: create enrollment, start payment before access granted).
 * Admission status is enforced in courseEnrollment.service — not here.
 */
export const identityOnlyGuard = asyncHandler(async function identityOnlyGuard(req, res, next) {
  try {
    await assertStudentIdentity(req, res, { requireVerified: false });
    return next();
  } catch (error) {
    return next(error);
  }
});
