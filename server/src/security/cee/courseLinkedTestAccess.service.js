/**
 * Canonical course-linked test access — single source of truth for eligibility checks.
 *
 * All student test start/prep/meta paths should use this module instead of parallel SQL ownership probes.
 */

import { mysqlPool } from '../../config/mysql.js';
import { STUDENT_ELIGIBLE_TEST_STATUS } from '../../constants/studentEligibleTest.constants.js';
import {
  TestNotAccessibleError,
  TestNotFoundError,
} from '../../errors/testAttempt/TestAttemptErrors.js';
import { isStandaloneAccessType } from '../../validators/testAccessType.js';

/** @typedef {'wrong_course'|'test_not_published'|'test_deleted'|'course_inactive'|'not_authorized_for_test'} CourseLinkedAccessReason */

/**
 * @param {Record<string, unknown>|null|undefined} testRow
 * @returns {boolean}
 */
export function isCourseLinkedTest(testRow) {
  if (isStandaloneAccessType(testRow?.test_access_type)) return false;
  const courseId = testRow?.course_id ?? testRow?.courseId;
  return courseId != null && Number(courseId) > 0;
}

/**
 * Schedule windows apply to standalone tests only — never course-linked tests.
 *
 * @param {Record<string, unknown>|null|undefined} testRow
 * @returns {boolean}
 */
export function shouldEnforceScheduleWindow(testRow) {
  return isStandaloneAccessType(testRow?.test_access_type);
}

/**
 * @param {Record<string, unknown>|null|undefined} testRow
 * @returns {boolean}
 */
export function isPublicAccessMode(testRow) {
  return String(testRow?.access_mode ?? 'private').trim().toLowerCase() === 'public';
}

/**
 * Course-linked student visibility. DB value `public` means available to enrolled
 * students of the assigned course — never anonymous/link-only access.
 * `private` is admin-only and must not be returned to students (404, no enumerate).
 *
 * @param {Record<string, unknown>|null|undefined} testRow
 * @param {Record<string, unknown>} [metadata]
 */
export function assertCourseLinkedTestReleasedToStudents(testRow, metadata = {}) {
  if (!isPublicAccessMode(testRow)) {
    throw new TestNotFoundError({
      ...metadata,
      testId: testRow?.id ?? testRow?.test_id ?? null,
      reason: 'admin_only_test',
    });
  }
}

/** SQL fragment: student runtime/listing must only see access_mode = public. */
export const COURSE_LINKED_ACCESS_TYPE_SQL = `AND t.test_access_type = 'course_locked'`;
export const COURSE_LINKED_STUDENT_VISIBLE_SQL = `AND t.access_mode = 'public' ${COURSE_LINKED_ACCESS_TYPE_SQL}`;

/**
 * Fail-closed eligibility after course match is confirmed.
 *
 * @param {Record<string, unknown>|null|undefined} testRow
 * @param {Record<string, unknown>} [metadata]
 */
export function assertCourseLinkedTestEligible(testRow, metadata = {}) {
  if (!testRow) {
    throw new TestNotFoundError({ ...metadata, reason: 'test_not_found' });
  }

  if (isStandaloneAccessType(testRow.test_access_type)) {
    throw new TestNotFoundError({
      ...metadata,
      testId: testRow.id ?? testRow.test_id ?? null,
      reason: 'standalone_runtime_not_enabled',
    });
  }

  if (testRow.deleted_at != null) {
    throw new TestNotAccessibleError({
      ...metadata,
      testId: testRow.id ?? testRow.test_id ?? null,
      reason: 'test_deleted',
    });
  }

  if (String(testRow.status) !== STUDENT_ELIGIBLE_TEST_STATUS) {
    throw new TestNotAccessibleError({
      ...metadata,
      testId: testRow.id ?? testRow.test_id ?? null,
      reason: 'test_not_published',
      status: testRow.status ?? null,
    });
  }

  const courseActive = testRow.course_is_active ?? testRow.courseIsActive;
  if (courseActive === 0 || courseActive === false) {
    throw new TestNotAccessibleError({
      ...metadata,
      testId: testRow.id ?? testRow.test_id ?? null,
      reason: 'course_inactive',
    });
  }
}

/**
 * @param {Record<string, unknown>} testRow
 * @param {number} entitledCourseId
 * @param {Record<string, unknown>} [metadata]
 */
export function assertCourseLinkedTestCourseMatch(testRow, entitledCourseId, metadata = {}) {
  const testCourseId = Number(testRow.course_id ?? testRow.courseId);
  const entitledId = Number(entitledCourseId);

  if (!Number.isInteger(testCourseId) || testCourseId <= 0) {
    throw new TestNotAccessibleError({
      ...metadata,
      testId: testRow.id ?? null,
      reason: 'orphan_test',
    });
  }

  if (testCourseId !== entitledId) {
    throw new TestNotAccessibleError({
      ...metadata,
      testId: testRow.id ?? null,
      reason: 'wrong_course',
      testCourseId,
      entitledCourseId: entitledId,
    });
  }
}

/**
 * Resolve a published course-linked test for an entitled course (by public slug).
 *
 * @param {string} slug
 * @param {number} entitledCourseId
 * @returns {Promise<{
 *   id: number,
 *   courseId: number,
 *   title: string,
 *   status: string,
 *   publicSlug: string|null,
 *   durationMinutes: number,
 *   maxAttempts: number,
 *   accessMode: string,
 * }>}
 */
export async function resolveEntitledCourseLinkedTestBySlug(slug, entitledCourseId) {
  const normalizedSlug = String(slug || '').trim();
  if (!normalizedSlug) {
    throw new TestNotFoundError({ reason: 'missing_slug' });
  }

  const entitledId = Number(entitledCourseId);
  if (!Number.isInteger(entitledId) || entitledId <= 0) {
    throw new TestNotAccessibleError({ reason: 'invalid_entitled_course_id' });
  }

  const [rows] = await mysqlPool.query(
    `SELECT t.id, t.course_id, t.test_access_type, t.title, t.status, t.public_slug, t.duration_minutes,
            t.max_attempts, t.access_mode, t.deleted_at, c.is_active AS course_is_active
     FROM tests t
     INNER JOIN courses c ON c.id = t.course_id
     WHERE t.public_slug = ?
     LIMIT 1`,
    [normalizedSlug]
  );
  const row = rows[0] ?? null;

  if (!row) {
    throw new TestNotFoundError({ slug: normalizedSlug, reason: 'test_not_found' });
  }

  assertCourseLinkedTestEligible(row, { slug: normalizedSlug, entitledCourseId: entitledId });
  assertCourseLinkedTestReleasedToStudents(row, { slug: normalizedSlug });
  assertCourseLinkedTestCourseMatch(row, entitledId, { slug: normalizedSlug });

  return mapEntitledTestRow(row);
}

/**
 * Resolve a published course-linked test for an entitled course (by test id).
 *
 * @param {number} testId
 * @param {number} entitledCourseId
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} [executor]
 */
export async function resolveEntitledCourseLinkedTestById(testId, entitledCourseId, executor = mysqlPool) {
  const tid = Number(testId);
  const entitledId = Number(entitledCourseId);

  if (!Number.isInteger(tid) || tid <= 0) {
    throw new TestNotFoundError({ testId: tid, reason: 'invalid_test_id' });
  }

  const [rows] = await executor.query(
    `SELECT t.id, t.course_id, t.test_access_type, t.title, t.status, t.public_slug, t.duration_minutes,
            t.max_attempts, t.access_mode, t.deleted_at, c.is_active AS course_is_active
     FROM tests t
     INNER JOIN courses c ON c.id = t.course_id
     WHERE t.id = ?
     LIMIT 1`,
    [tid]
  );
  const row = rows[0] ?? null;

  if (!row) {
    throw new TestNotFoundError({ testId: tid, reason: 'test_not_found' });
  }

  assertCourseLinkedTestEligible(row, { testId: tid, entitledCourseId: entitledId });
  assertCourseLinkedTestReleasedToStudents(row, { testId: tid });
  assertCourseLinkedTestCourseMatch(row, entitledId, { testId: tid });

  return mapEntitledTestRow(row);
}

/**
 * Load access gate row for public meta resolution.
 *
 * @param {string} slug
 */
export async function loadCourseLinkedTestAccessRowBySlug(slug) {
  const normalizedSlug = String(slug || '').trim();
  if (!normalizedSlug) return null;

  const [rows] = await mysqlPool.query(
    `SELECT t.id, t.course_id, t.test_access_type, t.status, t.deleted_at, t.access_mode, c.is_active AS course_is_active
     FROM tests t
     INNER JOIN courses c ON c.id = t.course_id
     WHERE t.public_slug = ?
     LIMIT 1`,
    [normalizedSlug]
  );

  return rows[0] ?? null;
}

/**
 * Student view/meta: admin-only (private) → 404. Available (public) requires
 * active enrollment in the assigned course. Never link-only / anonymous view.
 *
 * @param {Record<string, unknown>|null|undefined} accessRow
 * @param {number|null|undefined} viewerUserId
 * @param {number|null|undefined} viewerCourseId — active entitled course when viewer is authenticated
 */
export function assertCourseLinkedTestMetaAccessible(accessRow, viewerUserId = null, viewerCourseId = null) {
  if (!accessRow) {
    throw new TestNotFoundError({ reason: 'test_not_found' });
  }

  try {
    assertCourseLinkedTestEligible(accessRow);
  } catch (error) {
    if (error instanceof TestNotAccessibleError && error.metadata?.reason === 'test_deleted') {
      throw new TestNotFoundError({
        testId: accessRow.id ?? null,
        reason: 'test_deleted',
      });
    }
    if (error instanceof TestNotAccessibleError && error.metadata?.reason === 'test_not_published') {
      throw new TestNotFoundError({
        testId: accessRow.id ?? null,
        reason: 'test_not_published',
      });
    }
    throw error;
  }

  assertCourseLinkedTestReleasedToStudents(accessRow, { testId: accessRow.id ?? null });

  const uid = viewerUserId == null ? null : Number(viewerUserId);
  const cid = viewerCourseId == null ? null : Number(viewerCourseId);

  if (!Number.isInteger(uid) || uid <= 0 || !Number.isInteger(cid) || cid <= 0) {
    throw new TestNotFoundError({ testId: accessRow.id ?? null, reason: 'enrollment_required' });
  }

  try {
    assertCourseLinkedTestCourseMatch(accessRow, cid, { testId: accessRow.id ?? null });
  } catch {
    throw new TestNotFoundError({ testId: accessRow.id ?? null, reason: 'wrong_course' });
  }
}

/**
 * @param {Record<string, unknown>} row
 */
function mapEntitledTestRow(row) {
  return {
    id: Number(row.id),
    courseId: Number(row.course_id),
    title: String(row.title ?? ''),
    status: String(row.status ?? ''),
    publicSlug: row.public_slug ?? null,
    durationMinutes: Number(row.duration_minutes || 0),
    maxAttempts: Number(row.max_attempts ?? 1),
    accessMode: row.access_mode === 'public' ? 'public' : 'private',
  };
}
