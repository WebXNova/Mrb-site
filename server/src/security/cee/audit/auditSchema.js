/**
 * CEE Security Audit — canonical schema for SIEM / incident response.
 *
 * Immutable field names once released; bump schemaVersion for breaking changes.
 */

export const CEE_AUDIT_SCHEMA_VERSION = 'cee.security.audit.1';

/** Primary SIEM routing tag — filter aggregators on this */
export const CEE_SECURITY_AUDIT_TAG = 'cee.security.audit';

/**
 * High-level audit actions (stable for dashboards).
 * @readonly
 */
export const CEE_AUDIT_ACTIONS = Object.freeze({
  UNSCOPED_QUERY_ATTEMPT: 'scope.unscoped_query_attempt',
  MISSING_COURSE_SCOPE: 'scope.missing_course_scope',
  PROTECTED_TABLE_VIOLATION: 'scope.protected_table_violation',
  SCOPE_BYPASS: 'scope.bypass',
  SCOPE_ALLOWED: 'scope.allowed',
  ENTITLEMENT_FAILURE: 'entitlement.failure',
  ENTITLEMENT_DENIED: 'entitlement.denied',
  BYPASS_DENIED: 'scope.bypass_denied',
  INVALID_BYPASS: 'scope.invalid_bypass',
  PROTECTION_GRID_UNKNOWN_ROUTE: 'protection_grid.unknown_protected_route',
  PROTECTION_GRID_STARTUP_FAILED: 'protection_grid.startup_failed',
  ENROLLMENT_ACTIVATED: 'enrollment.activated',
  ENROLLMENT_DEACTIVATED: 'enrollment.deactivated',
  ENROLLMENT_REVOKED: 'enrollment.revoked',
  ENROLLMENT_INTEGRITY_VIOLATION: 'enrollment.integrity_violation',
});

/**
 * Violation / failure taxonomy (maps to detections).
 * @readonly
 */
export const CEE_AUDIT_VIOLATION_TYPES = Object.freeze({
  UNSCOPED_PROTECTED_QUERY: 'UNSCOPED_PROTECTED_QUERY',
  MISSING_COURSE_SCOPE: 'MISSING_COURSE_SCOPE',
  PROTECTED_TABLE_ACCESS: 'PROTECTED_TABLE_ACCESS',
  SCOPE_BYPASS: 'SCOPE_BYPASS',
  ENTITLEMENT_FAILURE: 'ENTITLEMENT_FAILURE',
  BYPASS_DENIED: 'BYPASS_DENIED',
  INVALID_BYPASS: 'INVALID_BYPASS',
  ENROLLMENT_INTEGRITY_VIOLATION: 'ENROLLMENT_INTEGRITY_VIOLATION',
});

/**
 * @typedef {'critical'|'high'|'medium'|'low'|'info'} CeeAuditSeverity
 */

/**
 * @typedef {'denied'|'bypass'|'failure'|'allowed'} CeeAuditOutcome
 */

/**
 * @typedef {keyof typeof CEE_AUDIT_ACTIONS} CeeAuditActionKey
 */

/**
 * @param {string} violationType
 * @returns {CeeAuditSeverity}
 */
export function severityForViolationType(violationType) {
  switch (violationType) {
    case CEE_AUDIT_VIOLATION_TYPES.MISSING_COURSE_SCOPE:
      return 'critical';
    case CEE_AUDIT_VIOLATION_TYPES.UNSCOPED_PROTECTED_QUERY:
    case CEE_AUDIT_VIOLATION_TYPES.PROTECTED_TABLE_ACCESS:
    case CEE_AUDIT_VIOLATION_TYPES.SCOPE_BYPASS:
    case CEE_AUDIT_VIOLATION_TYPES.ENTITLEMENT_FAILURE:
    case CEE_AUDIT_VIOLATION_TYPES.ENROLLMENT_INTEGRITY_VIOLATION:
      return 'high';
    case CEE_AUDIT_VIOLATION_TYPES.BYPASS_DENIED:
    case CEE_AUDIT_VIOLATION_TYPES.INVALID_BYPASS:
      return 'medium';
    default:
      return 'high';
  }
}
