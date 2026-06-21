/**
 * Enrollment state / switch guard errors — fail-closed.
 */

import { AppError } from '../base/AppError.js';
import { ADMISSIONS_CLOSED, CONFLICT, ENROLLMENT_ACTIVATION_DENIED } from '../codes/ErrorCodes.js';

export class EnrollmentClosedError extends AppError {
  /** @param {Record<string, unknown>|null} [metadata] */
  constructor(metadata = null) {
    super({
      message: 'Admissions are currently closed for this course.',
      errorCode: ADMISSIONS_CLOSED,
      httpStatus: 403,
      isOperational: true,
      metadata,
    });
  }
}

export class EnrollmentSwitchConfirmationRequiredError extends AppError {
  /** @param {Record<string, unknown>|null} [metadata] */
  constructor(metadata = null) {
    super({
      message: 'Switching courses requires explicit confirmation.',
      errorCode: 'ENROLLMENT_SWITCH_CONFIRMATION_REQUIRED',
      httpStatus: 409,
      isOperational: true,
      metadata,
    });
  }
}

export class DuplicateActiveEnrollmentError extends AppError {
  /** @param {Record<string, unknown>|null} [metadata] */
  constructor(metadata = null) {
    super({
      message: 'You already have active access to this course.',
      errorCode: 'DUPLICATE_ACTIVE_ENROLLMENT',
      httpStatus: 409,
      isOperational: true,
      metadata,
    });
  }
}

export class PremiumAccessProtectedError extends AppError {
  /** @param {Record<string, unknown>|null} [metadata] */
  constructor(metadata = null) {
    const reason = metadata?.reason;
    const message =
      reason === 'premium_blocks_free_enrollment'
        ? 'You have purchased a premium course. Free courses are no longer available for enrollment.'
        : 'Your premium course access cannot be replaced without explicit confirmation.';
    super({
      message,
      errorCode: 'PREMIUM_ACCESS_PROTECTED',
      httpStatus: 403,
      isOperational: true,
      metadata,
    });
  }
}

export class EnrollmentSwitchDeniedError extends AppError {
  /** @param {Record<string, unknown>|null} [metadata] */
  constructor(metadata = null) {
    super({
      message: 'This course switch is not allowed.',
      errorCode: ENROLLMENT_ACTIVATION_DENIED,
      httpStatus: 403,
      isOperational: true,
      metadata,
    });
  }
}

export class ActiveCourseConflictError extends AppError {
  /** @param {Record<string, unknown>|null} [metadata] */
  constructor(metadata = null) {
    super({
      message: 'You already have an active enrollment in a different course.',
      errorCode: CONFLICT,
      httpStatus: 409,
      isOperational: true,
      metadata,
    });
  }
}

export class CourseFullError extends AppError {
  /** @param {Record<string, unknown>|null} [metadata] */
  constructor(metadata = null) {
    super({
      message: 'This course is full. No seats are available.',
      errorCode: 'COURSE_FULL',
      httpStatus: 403,
      isOperational: true,
      metadata,
    });
  }
}
