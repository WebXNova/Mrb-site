/**
 * Student runtime audit + structured observability events.
 */

import { StructuredLogger } from '../utils/requestId.js';
import { emitSecurityAuditEvent } from '../security/cee/audit/securityAuditLogger.js';
import { CEE_AUDIT_ACTIONS, CEE_AUDIT_VIOLATION_TYPES } from '../security/cee/audit/auditSchema.js';

const logger = new StructuredLogger({ service: 'studentRuntimeObservability' });

export const STUDENT_RUNTIME_AUDIT_EVENTS = Object.freeze({
  OPERATION_SUCCESS: 'STUDENT_RUNTIME_OPERATION_SUCCESS',
  OPERATION_FAILURE: 'STUDENT_RUNTIME_OPERATION_FAILURE',
  ATTEMPT_CREATED: 'STUDENT_RUNTIME_ATTEMPT_CREATED',
  ATTEMPT_SUBMITTED: 'STUDENT_RUNTIME_ATTEMPT_SUBMITTED',
  TOKEN_VALIDATION_FAILURE: 'STUDENT_RUNTIME_TOKEN_VALIDATION_FAILURE',
  ENTITLEMENT_DENIAL: 'STUDENT_RUNTIME_ENTITLEMENT_DENIAL',
});

/**
 * @param {{
 *   event: string,
 *   stack: string,
 *   operation: string,
 *   durationMs?: number,
 *   requestId?: string|null,
 *   userId?: number|null,
 *   courseId?: number|null,
 *   attemptId?: number|null,
 *   testId?: number|null,
 *   slug?: string|null,
 *   outcome: 'success' | 'failure',
 *   errorCode?: string|null,
 *   metadata?: Record<string, unknown>,
 * }} payload
 */
export function emitStudentRuntimeAudit(payload) {
  const row = {
    event: payload.event,
    stack: payload.stack,
    operation: payload.operation,
    outcome: payload.outcome,
    durationMs: payload.durationMs ?? null,
    requestId: payload.requestId ?? null,
    userId: payload.userId ?? null,
    courseId: payload.courseId ?? null,
    attemptId: payload.attemptId ?? null,
    testId: payload.testId ?? null,
    slug: payload.slug ?? null,
    errorCode: payload.errorCode ?? null,
    ...payload.metadata,
  };

  if (payload.outcome === 'failure') {
    logger.warn('student runtime operation failed', row);
  }
}

/**
 * Security-relevant runtime denial — persisted to CEE audit stream.
 *
 * @param {{
 *   reason: string,
 *   userId?: number|null,
 *   courseId?: number|null,
 *   attemptId?: number|null,
 *   context?: string,
 *   errorCode?: string|null,
 * }} input
 */
export function auditStudentRuntimeSecurityDenial(input) {
  emitStudentRuntimeAudit({
    event: STUDENT_RUNTIME_AUDIT_EVENTS.ENTITLEMENT_DENIAL,
    stack: 'unknown',
    operation: input.context ?? 'studentRuntime.securityDenial',
    outcome: 'failure',
    userId: input.userId ?? null,
    courseId: input.courseId ?? null,
    attemptId: input.attemptId ?? null,
    errorCode: input.errorCode ?? input.reason,
  });

  emitSecurityAuditEvent({
    action: CEE_AUDIT_ACTIONS.ENTITLEMENT_FAILURE,
    violationType: CEE_AUDIT_VIOLATION_TYPES.ENTITLEMENT_FAILURE,
    outcome: 'denied',
    reason: input.reason,
    context: input.context ?? 'studentRuntimeObservability.auditStudentRuntimeSecurityDenial',
    userId: input.userId ?? null,
    courseId: input.courseId ?? null,
    errorCode: input.errorCode ?? null,
    tables: ['test_attempts', 'tests'],
    skipPersist: false,
  });
}
