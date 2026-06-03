/**
 * Structured diagnostics for CEE protection grid violations.
 */

import { env } from '../../config/env.js';
import { emitSecurityAuditEvent } from './audit/securityAuditLogger.js';
import { CEE_AUDIT_ACTIONS, CEE_AUDIT_VIOLATION_TYPES } from './audit/auditSchema.js';

export const CEE_GRID_AUDIT_ACTION = CEE_AUDIT_ACTIONS.PROTECTION_GRID_UNKNOWN_ROUTE;

/**
 * @param {object} payload
 * @param {string} payload.reason
 * @param {string} [payload.method]
 * @param {string} payload.path
 * @param {string|null} [payload.namespace]
 * @param {string|null} [payload.policyStatus]
 * @param {string|null} [payload.gridLabel]
 * @param {number|null} [payload.userId]
 * @param {string|null} [payload.requestId]
 */
export function logProtectionGridViolation(payload) {
  const record = emitSecurityAuditEvent({
    action: CEE_GRID_AUDIT_ACTION,
    violationType: CEE_AUDIT_VIOLATION_TYPES.ENTITLEMENT_FAILURE,
    outcome: 'denied',
    reason: payload.reason,
    context: 'cee.protectionGrid',
    route: payload.method && payload.path ? `${payload.method} ${payload.path}` : payload.path,
    userId: payload.userId ?? null,
    requestId: payload.requestId ?? null,
    tables: [],
    errorCode: 'CEE_UNKNOWN_PROTECTED_ROUTE',
    skipPersist: false,
  });

  if (env.nodeEnv !== 'production') {
    console.error(
      `[CEE.protectionGrid] DENIED ${payload.method ?? ''} ${payload.path} — ${payload.reason} ` +
        `(namespace=${payload.namespace ?? 'none'} policy=${payload.policyStatus ?? 'unregistered'})`
    );
  }

  return record;
}

/**
 * @param {ReadonlyArray<string>} issues
 */
export function logStartupGridFailures(issues) {
  const body = issues.join('\n  - ');
  console.error(`[CEE.protectionGrid] STARTUP VALIDATION FAILED:\n  - ${body}`);
  emitSecurityAuditEvent({
    action: CEE_AUDIT_ACTIONS.PROTECTION_GRID_STARTUP_FAILED,
    violationType: CEE_AUDIT_VIOLATION_TYPES.ENTITLEMENT_FAILURE,
    outcome: 'failure',
    reason: `startup_validation_failed: ${issues.length} issue(s)`,
    context: 'cee.protectionGrid.startup',
    route: null,
    errorCode: 'CEE_PROTECTION_GRID_MISCONFIGURED',
    skipPersist: false,
  });
}
