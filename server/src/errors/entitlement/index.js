/**
 * Entitlement failure policy — security-first, fail-closed rules.
 *
 * These constants document enforced behavior for entitlement.service.js and
 * all instructional read paths (dashboard, lectures, tests, media).
 */

export const ENTITLEMENT_FAILURE_POLICY = Object.freeze({
  /** Never grant access when entitlement resolution returns null/undefined. */
  denyOnMissingEntitlement: true,

  /** Never grant access when access_status !== 'active'. */
  requireActiveAccessStatus: true,

  /** Deny when enrollment is past expires_at (when column exists). */
  enforceExpiration: true,

  /** Treat revoked/inactive/replaced enrollments as hard denies. */
  denyRevoked: true,
  denyInactive: true,
  denyReplaced: true,

  /**
   * Multiple active enrollments for one user is a data-integrity incident —
   * deny content and raise MultipleActiveEnrollmentsError for monitoring.
   */
  denyOnMultipleActive: true,

  /** Unrecognized access_status or missing course_id on enrollment → InvalidEntitlementStateError. */
  denyOnCorruptedState: true,

  /** Only one course may be entitled at a time (platform invariant). */
  singleActiveCourse: true,
});

/** Valid access_status values that may grant instructional access. */
export const GRANTING_ACCESS_STATUSES = Object.freeze(['active']);

/** access_status values that must always deny. */
export const DENYING_ACCESS_STATUSES = Object.freeze(['inactive', 'revoked']);

/** enrollment.status values that block content even if access_status were wrong. */
export const BLOCKING_ENROLLMENT_STATUSES = Object.freeze(['pending', 'rejected']);

export {
  UnauthorizedError,
  ForbiddenError,
  EnrollmentNotFoundError,
  EnrollmentExpiredError,
  EnrollmentRevokedError,
  EnrollmentInactiveError,
  MultipleActiveEnrollmentsError,
  CourseAccessMismatchError,
  InvalidEntitlementStateError,
  CourseNotAccessibleError,
} from './EntitlementErrors.js';
