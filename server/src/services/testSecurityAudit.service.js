/**
 * Test System security audit trail — structured events for incident response.
 * Delegates to CEE emitSecurityAuditEvent; never logs secrets/tokens/passwords.
 */

import { emitSecurityAuditEvent } from '../security/cee/audit/securityAuditLogger.js';
import { logActivity } from './activityLog.service.js';
import { sanitizeMetadata } from '../utils/logSanitizer.js';

export const TEST_SECURITY_ACTIONS = Object.freeze({
  PUBLISH_ATTEMPT: 'test.publish_attempt',
  PUBLISH_SUCCESS: 'test.publish_success',
  PUBLISH_FAILED: 'test.publish_failed',
  VALIDATION_FAILURE: 'test.validation_failure',
  INVALID_TEST_MUTATION: 'test.invalid_mutation',
  PUBLISHED_TEST_EDIT_ATTEMPT: 'test.published_edit_attempt',
  PUBLISHED_TEST_EDIT: 'test.published_edit',
  QUESTION_LINKING_REJECTION: 'test.question_linking_rejection',
  INVALID_SUBJECT_INJECTION: 'test.invalid_subject_injection',
  LIFECYCLE_VIOLATION: 'test.lifecycle_violation',
  UNKNOWN_ENUM_VALUE: 'test.unknown_enum_value',
  LEGACY_ENDPOINT_ACCESS: 'test.legacy_endpoint_access',
  WIZARD_WRITE: 'test.wizard_write',
  TEST_DELETE: 'test.delete',
  TEST_DUPLICATE: 'test.duplicate',
  TEST_ATTEMPT_CREATE: 'test.attempt_create',
  TEST_ATTEMPT_DENIED: 'test.attempt_denied',
});

export const TEST_SECURITY_VIOLATION_TYPES = Object.freeze({
  TEST_SECURITY_EVENT: 'TEST_SECURITY_EVENT',
  VALIDATION_FAILURE: 'VALIDATION_FAILURE',
  INVALID_MUTATION: 'INVALID_TEST_MUTATION',
  LIFECYCLE_VIOLATION: 'LIFECYCLE_VIOLATION',
  LEGACY_BYPASS: 'LEGACY_ENDPOINT_ACCESS',
  SUBJECT_VIOLATION: 'QUESTION_SUBJECT_VIOLATION',
  PUBLISH_FAILURE: 'PUBLISH_FAILURE',
});

/**
 * @typedef {object} TestSecurityEventInput
 * @property {string} action — TEST_SECURITY_ACTIONS value
 * @property {number|null} [testId]
 * @property {number|null} [userId]
 * @property {string} [reason]
 * @property {Record<string, unknown>} [metadata]
 * @property {string} [timestamp] — ISO8601; defaults to now
 * @property {'denied'|'failure'|'allowed'} [outcome]
 * @property {string} [errorCode]
 * @property {string} [route]
 * @property {string} [context]
 */

/**
 * @param {TestSecurityEventInput} input
 */
export function logSecurityEvent(input) {
  const testId = input.testId != null ? Number(input.testId) : null;
  const userId = input.userId != null ? Number(input.userId) : null;
  const timestamp = input.timestamp || new Date().toISOString();

  const safeMeta = sanitizeMetadata({
    domain: 'test_system',
    testId: Number.isInteger(testId) && testId > 0 ? testId : null,
    eventTimestamp: timestamp,
    ...(input.metadata || {}),
  });

  const record = emitSecurityAuditEvent({
    action: String(input.action),
    violationType: mapActionToViolationType(input.action, input.errorCode),
    reason: input.reason || input.action,
    context: input.context || `testSecurity.${input.action}`,
    route: input.route || null,
    userId: Number.isInteger(userId) && userId > 0 ? userId : null,
    courseId: safeMeta.courseId != null ? Number(safeMeta.courseId) : null,
    tables: ['tests', 'test_subjects', 'test_questions'],
    errorCode: input.errorCode || null,
    outcome: input.outcome || (input.action.includes('success') ? 'allowed' : 'denied'),
  });

  void logActivity({
    userId: Number.isInteger(userId) && userId > 0 ? userId : null,
    role: 'system',
    action: `test.security.${input.action}`,
    entityType: 'test',
    entityId: testId != null ? String(testId) : null,
    metadata: safeMeta,
  });

  return record;
}

/**
 * @param {string} action
 * @param {string} [errorCode]
 */
function mapActionToViolationType(action, errorCode) {
  if (action === TEST_SECURITY_ACTIONS.LEGACY_ENDPOINT_ACCESS) {
    return TEST_SECURITY_VIOLATION_TYPES.LEGACY_BYPASS;
  }
  if (
    action === TEST_SECURITY_ACTIONS.LIFECYCLE_VIOLATION ||
    errorCode === 'VALIDATION_ERROR'
  ) {
    return TEST_SECURITY_VIOLATION_TYPES.LIFECYCLE_VIOLATION;
  }
  if (
    action === TEST_SECURITY_ACTIONS.INVALID_SUBJECT_INJECTION ||
    action === TEST_SECURITY_ACTIONS.QUESTION_LINKING_REJECTION ||
    errorCode === 'QUESTION_SUBJECT_NOT_ALLOWED'
  ) {
    return TEST_SECURITY_VIOLATION_TYPES.SUBJECT_VIOLATION;
  }
  if (action === TEST_SECURITY_ACTIONS.PUBLISH_FAILED) {
    return TEST_SECURITY_VIOLATION_TYPES.PUBLISH_FAILURE;
  }
  if (
    action === TEST_SECURITY_ACTIONS.VALIDATION_FAILURE ||
    action === TEST_SECURITY_ACTIONS.INVALID_TEST_MUTATION ||
    action === TEST_SECURITY_ACTIONS.PUBLISHED_TEST_EDIT_ATTEMPT
  ) {
    return TEST_SECURITY_VIOLATION_TYPES.VALIDATION_FAILURE;
  }
  return TEST_SECURITY_VIOLATION_TYPES.TEST_SECURITY_EVENT;
}

/**
 * @param {object} params
 * @param {number|null} [params.testId]
 * @param {number|null} [params.userId]
 * @param {string} params.errorCode
 * @param {string[]} [params.errors]
 * @param {string} [params.reason]
 * @param {string} [params.action]
 * @param {Record<string, unknown>} [params.metadata]
 */
export function logTestValidationFailure({
  testId = null,
  userId = null,
  errorCode,
  errors = [],
  reason,
  action = TEST_SECURITY_ACTIONS.VALIDATION_FAILURE,
  metadata = {},
}) {
  return logSecurityEvent({
    action,
    testId,
    userId,
    reason: reason || errorCode,
    errorCode,
    outcome: 'denied',
    metadata: { errors, ...metadata },
  });
}

/**
 * @param {import('express').Request} [req]
 * @param {TestSecurityEventInput} event
 */
export function logSecurityEventFromRequest(req, event) {
  return logSecurityEvent({
    ...event,
    userId: event.userId ?? req?.user?.id ?? null,
    route: event.route ?? req?.originalUrl ?? req?.path ?? null,
  });
}
