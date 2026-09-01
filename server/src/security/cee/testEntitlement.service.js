/**
 * CEE Test Hard Lock — course-bound tests; no global/orphan test access.
 */

import { AppError } from '../../errors/base/AppError.js';
import { ACCESS_DENIED } from '../../errors/codes/ErrorCodes.js';
import { assertCourseScope } from './scopedQueryGuard.js';
import {
  resolveEntitledCourseLinkedTestById,
  resolveEntitledCourseLinkedTestBySlug,
} from './courseLinkedTestAccess.service.js';

export class OrphanTestAccessDeniedError extends AppError {
  constructor(metadata = null) {
    super({
      message: 'This test is not linked to a course and cannot be accessed.',
      errorCode: ACCESS_DENIED,
      httpStatus: 403,
      isOperational: true,
      metadata,
    });
  }
}

/**
 * @typedef {object} EntitledTestRow
 * @property {number} id
 * @property {number} courseId
 * @property {string} title
 * @property {string} status
 * @property {string|null} publicSlug
 * @property {number} durationMinutes
 * @property {number} maxAttempts
 * @property {string} accessMode
 */

/**
 * Load published course-linked test by slug for an entitled course.
 *
 * @param {string} slug
 * @param {number} entitledCourseId
 * @returns {Promise<EntitledTestRow>}
 */
export async function resolveEntitledTestBySlug(slug, entitledCourseId) {
  assertCourseScope(entitledCourseId, { context: 'resolveEntitledTestBySlug' });
  return resolveEntitledCourseLinkedTestBySlug(slug, entitledCourseId);
}

/**
 * Load published course-linked test by id for an entitled course.
 *
 * @param {number} testId
 * @param {number} entitledCourseId
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} [executor]
 * @returns {Promise<EntitledTestRow>}
 */
export async function resolveEntitledTestById(testId, entitledCourseId, executor) {
  assertCourseScope(entitledCourseId, { context: 'resolveEntitledTestById' });
  return resolveEntitledCourseLinkedTestById(testId, entitledCourseId, executor);
}

/**
 * @deprecated Redundant after resolveEntitledTestBySlug SQL course_id filter + assertCourseAccess.
 *
 * @param {import('../../services/entitlement.service.js').EntitlementContext} _entitlement
 * @param {EntitledTestRow} _test
 */
export function assertTestAccessibleForEntitlement(_entitlement, _test) {
  // Intentionally no-op — course match is enforced in resolveEntitledTestBySlug/ById + assertCourseAccess.
}
