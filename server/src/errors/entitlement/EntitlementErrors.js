/**
 * Entitlement and course-access security errors.
 *
 * All failures fail CLOSED — never return partial content on ambiguous state.
 */

import { AppError } from '../base/AppError.js';
import {
  ACCESS_DENIED,
  ACCESS_EXPIRED,
  ACCESS_INACTIVE,
  ACCESS_REVOKED,
  AUTH_REQUIRED,
  COURSE_ACCESS_MISMATCH,
  COURSE_NOT_ACCESSIBLE,
  ENROLLMENT_NOT_FOUND,
  INVALID_ENTITLEMENT_STATE,
  MULTIPLE_ACTIVE_ENROLLMENTS,
} from '../codes/ErrorCodes.js';

/** @typedef {Record<string, unknown>} ErrorMetadata */

export class UnauthorizedError extends AppError {
  /** @param {string} [message] @param {ErrorMetadata|null} [metadata] */
  constructor(message = 'Authentication required.', metadata = null) {
    super({
      message,
      errorCode: AUTH_REQUIRED,
      httpStatus: 401,
      isOperational: true,
      metadata,
    });
  }
}

export class ForbiddenError extends AppError {
  /** @param {string} [message] @param {ErrorMetadata|null} [metadata] */
  constructor(message = 'Access denied.', metadata = null) {
    super({
      message,
      errorCode: ACCESS_DENIED,
      httpStatus: 403,
      isOperational: true,
      metadata,
    });
  }
}

export class EnrollmentNotFoundError extends AppError {
  /** @param {ErrorMetadata|null} [metadata] */
  constructor(metadata = null) {
    super({
      message: 'No active enrollment was found for your account.',
      errorCode: ENROLLMENT_NOT_FOUND,
      httpStatus: 403,
      isOperational: true,
      metadata,
    });
  }
}

export class EnrollmentExpiredError extends AppError {
  /** @param {ErrorMetadata|null} [metadata] */
  constructor(metadata = null) {
    super({
      message: 'Your course access has expired.',
      errorCode: ACCESS_EXPIRED,
      httpStatus: 403,
      isOperational: true,
      metadata,
    });
  }
}

export class EnrollmentRevokedError extends AppError {
  /** @param {ErrorMetadata|null} [metadata] */
  constructor(metadata = null) {
    super({
      message: 'Your course access has been revoked.',
      errorCode: ACCESS_REVOKED,
      httpStatus: 403,
      isOperational: true,
      metadata,
    });
  }
}

export class EnrollmentInactiveError extends AppError {
  /** @param {ErrorMetadata|null} [metadata] */
  constructor(metadata = null) {
    super({
      message: 'Your enrollment is not active. Complete payment or contact support.',
      errorCode: ACCESS_INACTIVE,
      httpStatus: 403,
      isOperational: true,
      metadata,
    });
  }
}

/**
 * Data integrity violation — more than one active entitlement for a user.
 * Surfaced as 409 to distinguish from simple denial; triggers ops alerting.
 */
export class MultipleActiveEnrollmentsError extends AppError {
  /** @param {ErrorMetadata|null} [metadata] */
  constructor(metadata = null) {
    super({
      message: 'Your account access is temporarily unavailable. Please contact support.',
      errorCode: MULTIPLE_ACTIVE_ENROLLMENTS,
      httpStatus: 409,
      isOperational: true,
      metadata,
    });
  }
}

export class CourseAccessMismatchError extends AppError {
  /** @param {ErrorMetadata|null} [metadata] */
  constructor(metadata = null) {
    super({
      message: 'You do not have access to this course.',
      errorCode: COURSE_ACCESS_MISMATCH,
      httpStatus: 403,
      isOperational: true,
      metadata,
    });
  }
}

/**
 * Corrupted or unrecognizable entitlement row — stop delivery immediately.
 */
export class InvalidEntitlementStateError extends AppError {
  /** @param {ErrorMetadata|null} [metadata] */
  constructor(metadata = null) {
    super({
      message: 'Unable to verify course access. Please try again or contact support.',
      errorCode: INVALID_ENTITLEMENT_STATE,
      httpStatus: 500,
      isOperational: true,
      metadata,
    });
  }
}

export class CourseNotAccessibleError extends AppError {
  /** @param {ErrorMetadata|null} [metadata] */
  constructor(metadata = null) {
    super({
      message: 'This course content is not available with your current access.',
      errorCode: COURSE_NOT_ACCESSIBLE,
      httpStatus: 403,
      isOperational: true,
      metadata,
    });
  }
}
