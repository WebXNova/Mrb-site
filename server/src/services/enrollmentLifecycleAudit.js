/**
 * Structured SIEM audit for enrollment access_status transitions.
 */

import { emitSecurityAuditEvent } from '../security/cee/audit/securityAuditLogger.js';
import { CEE_AUDIT_ACTIONS, CEE_AUDIT_VIOLATION_TYPES } from '../security/cee/audit/auditSchema.js';

/**
 * @typedef {'activation'|'deactivation'|'revocation'|'integrity_violation'|'idempotent_skip'} EnrollmentAuditAction
 */

/**
 * @param {object} input
 * @param {EnrollmentAuditAction} input.action
 * @param {'success'|'denied'|'failure'|'idempotent'} input.result
 * @param {number|null} input.userId
 * @param {number|null} input.enrollmentId
 * @param {number|null} input.courseId
 * @param {string} input.actor
 * @param {string} [input.reason]
 * @param {string|null} [input.errorCode]
 */
export function auditEnrollmentLifecycleEvent(input) {
  const actionMap = {
    activation: CEE_AUDIT_ACTIONS.ENROLLMENT_ACTIVATED,
    deactivation: CEE_AUDIT_ACTIONS.ENROLLMENT_DEACTIVATED,
    revocation: CEE_AUDIT_ACTIONS.ENROLLMENT_REVOKED,
    integrity_violation: CEE_AUDIT_ACTIONS.ENROLLMENT_INTEGRITY_VIOLATION,
    idempotent_skip: CEE_AUDIT_ACTIONS.ENROLLMENT_ACTIVATED,
  };

  const outcomeMap = {
    success: 'allowed',
    denied: 'denied',
    failure: 'failure',
    idempotent: 'allowed',
  };

  const violationType =
    input.result === 'failure' || input.action === 'integrity_violation'
      ? CEE_AUDIT_VIOLATION_TYPES.ENROLLMENT_INTEGRITY_VIOLATION
      : CEE_AUDIT_VIOLATION_TYPES.ENTITLEMENT_FAILURE;

  return emitSecurityAuditEvent({
    action: actionMap[input.action] ?? CEE_AUDIT_ACTIONS.ENROLLMENT_ACTIVATED,
    violationType,
    outcome: outcomeMap[input.result] ?? 'denied',
    reason: [
      input.reason ?? input.action,
      input.enrollmentId != null ? `enrollmentId=${input.enrollmentId}` : null,
      input.result,
    ]
      .filter(Boolean)
      .join(' '),
    context: `enrollmentLifecycle.${input.actor}`,
    userId: input.userId ?? null,
    courseId: input.courseId ?? null,
    errorCode: input.errorCode ?? null,
    tables: ['enrollments'],
    skipPersist: false,
  });
}
