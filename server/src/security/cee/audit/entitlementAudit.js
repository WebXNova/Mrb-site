/**
 * Entitlement audit — logs granted and denied instructional access.
 *
 * Instructional access (CEE) is granted solely by access_status = 'active'.
 * courses.admission_status is logged for context but never blocks active entitlements.
 */

import {
  ACCESS_DENIED,
  ACCESS_EXPIRED,
  ACCESS_INACTIVE,
  ACCESS_REVOKED,
  ADMISSIONS_CLOSED,
  AUTH_REQUIRED,
  COURSE_ACCESS_MISMATCH,
  COURSE_NOT_ACCESSIBLE,
  ENROLLMENT_NOT_FOUND,
  ENTITLEMENT_REQUIRED,
  INVALID_ENTITLEMENT_STATE,
  MULTIPLE_ACTIVE_ENROLLMENTS,
} from '../../../errors/codes/ErrorCodes.js';
import { ADMISSION_STATUS } from '../../../models/course.model.js';
import { getCourseRowById } from '../../../services/courseCatalogQueries.service.js';
import { CEE_AUDIT_ACTIONS, CEE_AUDIT_VIOLATION_TYPES } from './auditSchema.js';
import { emitSecurityAuditEvent } from './securityAuditLogger.js';

const ENTITLEMENT_ERROR_CODES = new Set([
  AUTH_REQUIRED,
  ACCESS_DENIED,
  ENROLLMENT_NOT_FOUND,
  ACCESS_EXPIRED,
  ACCESS_REVOKED,
  ACCESS_INACTIVE,
  MULTIPLE_ACTIVE_ENROLLMENTS,
  COURSE_ACCESS_MISMATCH,
  INVALID_ENTITLEMENT_STATE,
  COURSE_NOT_ACCESSIBLE,
  ENTITLEMENT_REQUIRED,
  ADMISSIONS_CLOSED,
]);

/**
 * @param {unknown} error
 */
export function isEntitlementAuditError(error) {
  const code = error && typeof error === 'object' && 'errorCode' in error ? error.errorCode : null;
  return typeof code === 'string' && ENTITLEMENT_ERROR_CODES.has(code);
}

/**
 * @param {import('express').Request} req
 */
export function buildRouteLabelFromRequest(req) {
  if (!req) return null;
  const path = req.originalUrl || req.url || req.path || '';
  return `${String(req.method || 'GET').toUpperCase()} ${path}`;
}

/**
 * @param {number|null|undefined} courseId
 */
async function loadAdmissionAuditContext(courseId) {
  const cid = Number(courseId);
  if (!Number.isInteger(cid) || cid <= 0) {
    return { admission_status: null, admissions_open: null };
  }
  try {
    const row = await getCourseRowById(cid);
    const admission_status = row?.admission_status ?? null;
    return {
      admission_status,
      admissions_open: String(admission_status || '').toUpperCase() === ADMISSION_STATUS.OPEN,
    };
  } catch {
    return { admission_status: null, admissions_open: null };
  }
}

function formatAuditReason(base, admission, suffix) {
  const parts = [base];
  if (admission.admission_status != null) {
    parts.push(`admission=${admission.admission_status}`);
  }
  if (admission.admissions_open != null) {
    parts.push(`admissions_open=${admission.admissions_open}`);
  }
  parts.push(suffix);
  return parts.join(' ');
}

/**
 * @param {unknown} error
 * @param {import('express').Request} [req]
 * @param {{ context?: string, skipPersist?: boolean }} [options]
 */
export async function auditEntitlementFailure(error, req, options = {}) {
  if (!isEntitlementAuditError(error)) return null;

  const metadata = error && typeof error === 'object' && 'metadata' in error ? error.metadata : null;
  const meta = metadata && typeof metadata === 'object' ? /** @type {Record<string, unknown>} */ (metadata) : {};

  const errorCode = String(error.errorCode);
  const baseReason =
    (typeof meta.reason === 'string' && meta.reason) ||
    (typeof meta.hint === 'string' && meta.hint) ||
    (typeof error.message === 'string' && error.message) ||
    errorCode;

  const courseId =
    meta.courseId ??
    meta.requestedCourseId ??
    req?.cee?.courseId ??
    null;

  const admission = await loadAdmissionAuditContext(
    courseId != null ? Number(courseId) : null
  );

  return emitSecurityAuditEvent({
    action: CEE_AUDIT_ACTIONS.ENTITLEMENT_FAILURE,
    violationType: CEE_AUDIT_VIOLATION_TYPES.ENTITLEMENT_FAILURE,
    outcome: 'failure',
    reason: formatAuditReason(baseReason, admission, 'access_decision=denied'),
    context: String(options.context ?? meta.context ?? 'cee.entitlement'),
    route: buildRouteLabelFromRequest(req),
    userId: req?.user?.id ?? meta.userId ?? null,
    requestId: req?.requestId ?? null,
    courseId: courseId != null ? Number(courseId) : null,
    tables: [],
    errorCode,
    skipPersist: options.skipPersist,
    devConsole: true,
  });
}

/**
 * Log successful instructional access — includes admission context for closed-course audits.
 *
 * @param {import('../../../services/entitlement.service.js').EntitlementContext} entitlement
 * @param {import('express').Request} req
 * @param {{ context?: string, skipPersist?: boolean }} [options]
 */
export async function auditEntitlementGranted(entitlement, req, options = {}) {
  const admission = await loadAdmissionAuditContext(entitlement.courseId);
  const closedCourseRetainedAccess =
    admission.admissions_open === false && entitlement.accessStatus === 'active';

  const baseReason = closedCourseRetainedAccess
    ? 'active_entitlement_retained_despite_closed_admissions'
    : 'active_entitlement_granted';

  return emitSecurityAuditEvent({
    action: CEE_AUDIT_ACTIONS.ENTITLEMENT_GRANTED,
    violationType: CEE_AUDIT_VIOLATION_TYPES.ENTITLEMENT_GRANTED,
    outcome: 'allowed',
    reason: formatAuditReason(
      baseReason,
      admission,
      closedCourseRetainedAccess
        ? 'access_decision=granted_closed_course_retained'
        : 'access_decision=granted'
    ),
    context: String(options.context ?? 'cee.entitlement'),
    route: buildRouteLabelFromRequest(req),
    userId: entitlement.userId ?? req?.user?.id ?? null,
    requestId: req?.requestId ?? null,
    courseId: entitlement.courseId,
    tables: [],
    errorCode: null,
    skipPersist: options.skipPersist,
    devConsole: shouldLogGrantAudit(closedCourseRetainedAccess),
  });
}

function shouldLogGrantAudit(closedCourseRetainedAccess) {
  if (closedCourseRetainedAccess) return true;
  if (String(process.env.CEE_ENTITLEMENT_GRANT_AUDIT || '').toLowerCase() === 'always') {
    return true;
  }
  return process.env.NODE_ENV !== 'production';
}
