/**
 * Entitlement failure audit — logs denied access before error propagates to client.
 */

import {
  ACCESS_DENIED,
  ACCESS_EXPIRED,
  ACCESS_INACTIVE,
  ACCESS_REVOKED,
  AUTH_REQUIRED,
  COURSE_ACCESS_MISMATCH,
  COURSE_NOT_ACCESSIBLE,
  ENROLLMENT_NOT_FOUND,
  ENTITLEMENT_REQUIRED,
  INVALID_ENTITLEMENT_STATE,
  MULTIPLE_ACTIVE_ENROLLMENTS,
} from '../../../errors/codes/ErrorCodes.js';
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
 * @param {unknown} error
 * @param {import('express').Request} [req]
 * @param {{ context?: string, skipPersist?: boolean }} [options]
 */
export function auditEntitlementFailure(error, req, options = {}) {
  if (!isEntitlementAuditError(error)) return null;

  const metadata = error && typeof error === 'object' && 'metadata' in error ? error.metadata : null;
  const meta = metadata && typeof metadata === 'object' ? /** @type {Record<string, unknown>} */ (metadata) : {};

  const errorCode = String(error.errorCode);
  const reason =
    (typeof meta.reason === 'string' && meta.reason) ||
    (typeof meta.hint === 'string' && meta.hint) ||
    (typeof error.message === 'string' && error.message) ||
    errorCode;

  return emitSecurityAuditEvent({
    action: CEE_AUDIT_ACTIONS.ENTITLEMENT_FAILURE,
    violationType: CEE_AUDIT_VIOLATION_TYPES.ENTITLEMENT_FAILURE,
    outcome: 'failure',
    reason,
    context: String(options.context ?? meta.context ?? 'cee.entitlement'),
    route: buildRouteLabelFromRequest(req),
    userId: req?.user?.id ?? meta.userId ?? null,
    requestId: req?.requestId ?? null,
    courseId: meta.courseId ?? req?.cee?.courseId ?? null,
    tables: [],
    errorCode,
    skipPersist: options.skipPersist,
  });
}
