/**
 * CEE Test Hard Lock — course-bound tests; no global/orphan test access.
 */

import { AppError } from '../../errors/base/AppError.js';
import { ACCESS_DENIED, COURSE_ACCESS_MISMATCH } from '../../errors/codes/ErrorCodes.js';
import { assertCourseScope } from './scopedQueryGuard.js';
import { scopedQuery } from './db/scopedQuery.js';

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
 */

/**
 * Load published test by slug — MUST have course_id; never global listing.
 * @param {string} slug
 * @param {number} entitledCourseId
 * @returns {Promise<EntitledTestRow>}
 */
export async function resolveEntitledTestBySlug(slug, entitledCourseId) {
  const cid = assertCourseScope(entitledCourseId, { context: 'resolveEntitledTestBySlug' });
  const normalizedSlug = String(slug || '').trim();
  if (!normalizedSlug) {
    throw new OrphanTestAccessDeniedError({ reason: 'missing_slug' });
  }

  const db = scopedQuery({ courseId: cid, context: 'testEntitlement.resolveEntitledTestBySlug' });
  const row = await db.first(
    `SELECT id, course_id, title, status, public_slug, duration_minutes, max_attempts, access_mode
     FROM tests
     WHERE public_slug = ?
       AND status = 'published'
       AND course_id = ?
     LIMIT 1`,
    [normalizedSlug, cid]
  );

  if (!row) {
    throw new OrphanTestAccessDeniedError({
      slug: normalizedSlug,
      courseId: cid,
      reason: 'not_found_or_not_published',
    });
  }

  if (row.course_id == null) {
    throw new OrphanTestAccessDeniedError({ testId: row.id, reason: 'null_course_id' });
  }

  return {
    id: Number(row.id),
    courseId: Number(row.course_id),
    title: String(row.title),
    status: String(row.status),
    publicSlug: row.public_slug ?? null,
    durationMinutes: Number(row.duration_minutes || 0),
    maxAttempts: Number(row.max_attempts ?? 1),
  };
}

/**
 * @param {import('../../services/entitlement.service.js').EntitlementContext} entitlement
 * @param {EntitledTestRow} test
 */
export function assertTestAccessibleForEntitlement(entitlement, test) {
  if (Number(test.courseId) !== Number(entitlement.courseId)) {
    const err = new AppError({
      message: 'You do not have access to this test.',
      errorCode: COURSE_ACCESS_MISMATCH,
      httpStatus: 403,
      isOperational: true,
      metadata: {
        testId: test.id,
        testCourseId: test.courseId,
        entitledCourseId: entitlement.courseId,
      },
    });
    throw err;
  }
}
