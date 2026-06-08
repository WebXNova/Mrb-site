/**
 * Test lifecycle guards — publish execution and request-body lifecycle field blocking.
 * Validation authority: testValidation.service.js
 */

import { mysqlPool } from '../config/mysql.js';
import { AppError } from '../errors/base/AppError.js';
import {
  LEGACY_ENDPOINT_DISABLED,
  VALIDATION_ERROR,
} from '../errors/codes/ErrorCodes.js';
import { validatePublishEligibility } from './testPublishEligibility.service.js';
import {
  logSecurityEvent,
  TEST_SECURITY_ACTIONS,
} from './testSecurityAudit.service.js';

export const LIFECYCLE_FORBIDDEN_BODY_KEYS = Object.freeze([
  'status',
  'published',
  'draft',
  'archived',
  'lifecycle_status',
  'lifecycleStatus',
  'READY_FOR_PUBLISH',
  'INCOMPLETE',
  'PUBLISHED',
  'DRAFT',
]);

/**
 * @param {unknown} body
 * @param {{ testId?: number|null, userId?: number|null }} [auditContext]
 */
export function rejectLifecycleFieldsInBody(body, auditContext = {}) {
  if (body == null || typeof body !== 'object' || Array.isArray(body)) {
    return;
  }

  const present = LIFECYCLE_FORBIDDEN_BODY_KEYS.filter((key) =>
    Object.prototype.hasOwnProperty.call(body, key)
  );

  if (present.length) {
    logSecurityEvent({
      action: TEST_SECURITY_ACTIONS.LIFECYCLE_VIOLATION,
      testId: auditContext.testId ?? null,
      userId: auditContext.userId ?? null,
      reason: 'LIFECYCLE_FIELD_IN_REQUEST_BODY',
      errorCode: VALIDATION_ERROR,
      outcome: 'denied',
      metadata: { forbiddenFields: present },
    });

    throw new AppError({
      message: 'Lifecycle fields cannot be modified through this endpoint. Use POST /admin/tests/:id/publish.',
      errorCode: VALIDATION_ERROR,
      httpStatus: 422,
      isOperational: true,
      metadata: { forbiddenFields: present },
    });
  }
}

/**
 * @param {number} testId
 * @param {{ userId?: number|null }} [options]
 */
export async function assertPublishEligibility(testId, options = {}) {
  return validatePublishEligibility(testId, mysqlPool, {
    throwOnFailure: true,
    userId: options.userId,
  });
}

/**
 * ONLY function that may set tests.status = 'published'.
 * @param {number} testId
 * @param {string} publicSlug
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} [executor]
 */
export async function executePublishTestStatus(testId, publicSlug, executor = mysqlPool) {
  const tid = Number(testId);
  await executor.query(
    `UPDATE tests
     SET status = 'published', public_slug = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND deleted_at IS NULL`,
    [publicSlug, tid]
  );
}

export { LEGACY_ENDPOINT_DISABLED };
