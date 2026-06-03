/**
 * Entitlement kernel — authoritative course-access resolution (Phase 1C foundation).
 *
 * All instructional read paths should call assertCourseAccess() or resolveActiveEntitlement()
 * before returning content. Failures throw structured AppError subclasses (fail-closed).
 *
 * Wired into studentPortal.service.js (Phase 1D-B dashboard reads).
 */

import { mysqlPool } from '../config/mysql.js';
import {
  BLOCKING_ENROLLMENT_STATUSES,
  DENYING_ACCESS_STATUSES,
  GRANTING_ACCESS_STATUSES,
} from '../errors/entitlement/index.js';
import {
  CourseAccessMismatchError,
  EnrollmentExpiredError,
  EnrollmentInactiveError,
  EnrollmentNotFoundError,
  EnrollmentRevokedError,
  InvalidEntitlementStateError,
  MultipleActiveEnrollmentsError,
} from '../errors/entitlement/EntitlementErrors.js';

/**
 * @typedef {object} EntitlementContext
 * @property {number} enrollmentId
 * @property {number} userId
 * @property {number} courseId
 * @property {string} accessStatus
 * @property {string} enrollmentStatus
 * @property {number|null} orderId
 * @property {Date|null} expiresAt
 */

const ACTIVE_ENTITLEMENT_SELECT = `
  SELECT
    e.id,
    e.user_id,
    e.course_id,
    e.order_id,
    e.status AS enrollment_status,
    e.access_status,
    e.updated_at
  FROM enrollments e
  WHERE e.user_id = ?
    AND e.access_status = 'active'
  ORDER BY e.updated_at DESC, e.id DESC
`;

/**
 * Load all rows marked access_status = 'active' for integrity checks.
 * @param {number} userId
 * @returns {Promise<Array<Record<string, unknown>>>}
 */
async function loadActiveEntitlementRows(userId) {
  const uid = normalizeUserId(userId);
  const [rows] = await mysqlPool.query(ACTIVE_ENTITLEMENT_SELECT, [uid]);
  return rows || [];
}

/**
 * Resolve the single active entitlement for a user.
 * @param {number} userId
 * @returns {Promise<EntitlementContext|null>}
 */
export async function resolveActiveEntitlement(userId) {
  const rows = await loadActiveEntitlementRows(userId);

  if (rows.length === 0) {
    return null;
  }

  if (rows.length > 1) {
    throw new MultipleActiveEnrollmentsError({
      userId: normalizeUserId(userId),
      activeEnrollmentIds: rows.map((r) => Number(r.id)),
    });
  }

  return mapRowToEntitlementContext(rows[0]);
}

/**
 * Assert the user has a valid, non-expired entitlement for the requested course.
 * @param {number} userId
 * @param {number} courseId
 * @returns {Promise<EntitlementContext>}
 */
export async function assertCourseAccess(userId, courseId) {
  const uid = normalizeUserId(userId);
  const cid = normalizeCourseId(courseId);

  const entitlement = await resolveActiveEntitlement(uid);

  if (!entitlement) {
    throw new EnrollmentNotFoundError({ userId: uid, courseId: cid });
  }

  assertEntitlementGrantable(entitlement, { userId: uid, courseId: cid });

  if (Number(entitlement.courseId) !== cid) {
    throw new CourseAccessMismatchError({
      userId: uid,
      requestedCourseId: cid,
      entitledCourseId: entitlement.courseId,
      enrollmentId: entitlement.enrollmentId,
    });
  }

  return entitlement;
}

/**
 * Validate entitlement row invariants before granting access.
 * @param {EntitlementContext} entitlement
 * @param {{ userId: number, courseId?: number }} ctx
 */
export function assertEntitlementGrantable(entitlement, ctx) {
  if (!entitlement || typeof entitlement !== 'object') {
    throw new InvalidEntitlementStateError({ reason: 'null_entitlement', ...ctx });
  }

  const accessStatus = String(entitlement.accessStatus || '').toLowerCase();
  const enrollmentStatus = String(entitlement.enrollmentStatus || '').toLowerCase();

  if (!GRANTING_ACCESS_STATUSES.includes(accessStatus)) {
    if (accessStatus === 'revoked') {
      throw new EnrollmentRevokedError({
        enrollmentId: entitlement.enrollmentId,
        userId: entitlement.userId,
        accessStatus,
      });
    }
    if (DENYING_ACCESS_STATUSES.includes(accessStatus)) {
      throw new EnrollmentInactiveError({
        enrollmentId: entitlement.enrollmentId,
        userId: entitlement.userId,
        accessStatus,
      });
    }
    throw new InvalidEntitlementStateError({
      reason: 'unknown_access_status',
      accessStatus,
      enrollmentId: entitlement.enrollmentId,
      userId: entitlement.userId,
    });
  }

  if (BLOCKING_ENROLLMENT_STATUSES.includes(enrollmentStatus)) {
    throw new EnrollmentInactiveError({
      enrollmentId: entitlement.enrollmentId,
      userId: entitlement.userId,
      enrollmentStatus,
      reason: 'blocking_enrollment_status',
    });
  }

  if (!Number.isInteger(entitlement.courseId) || entitlement.courseId <= 0) {
    throw new InvalidEntitlementStateError({
      reason: 'missing_course_id',
      enrollmentId: entitlement.enrollmentId,
      userId: entitlement.userId,
    });
  }

  if (entitlement.expiresAt instanceof Date && entitlement.expiresAt.getTime() <= Date.now()) {
    throw new EnrollmentExpiredError({
      enrollmentId: entitlement.enrollmentId,
      userId: entitlement.userId,
      expiresAt: entitlement.expiresAt.toISOString(),
    });
  }
}

/**
 * @param {Record<string, unknown>} row
 * @returns {EntitlementContext}
 */
function mapRowToEntitlementContext(row) {
  const enrollmentId = Number(row.id);
  const userId = Number(row.user_id);
  const courseId = Number(row.course_id);

  if (!Number.isInteger(enrollmentId) || enrollmentId <= 0) {
    throw new InvalidEntitlementStateError({ reason: 'invalid_enrollment_id', rowId: row.id });
  }

  /** Future: e.expires_at when migration adds column */
  const expiresAtRaw = row.expires_at ?? row.access_expires_at ?? null;
  let expiresAt = null;
  if (expiresAtRaw) {
    const parsed = new Date(expiresAtRaw);
    expiresAt = Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  return {
    enrollmentId,
    userId,
    courseId,
    accessStatus: String(row.access_status || ''),
    enrollmentStatus: String(row.enrollment_status || row.status || ''),
    orderId: row.order_id == null ? null : Number(row.order_id),
    expiresAt,
  };
}

function normalizeUserId(userId) {
  const uid = Number(userId);
  if (!Number.isInteger(uid) || uid <= 0) {
    throw new InvalidEntitlementStateError({ reason: 'invalid_user_id', userId });
  }
  return uid;
}

function normalizeCourseId(courseId) {
  const cid = Number(courseId);
  if (!Number.isInteger(cid) || cid <= 0) {
    throw new InvalidEntitlementStateError({ reason: 'invalid_course_id', courseId });
  }
  return cid;
}
