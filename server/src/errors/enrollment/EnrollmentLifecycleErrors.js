/**
 * Enrollment lifecycle errors — activation, revocation, integrity (fail-closed).
 */

import { AppError } from '../base/AppError.js';
import {
  ACCESS_REVOKED,
  ENROLLMENT_ACTIVATION_DENIED,
  ENROLLMENT_INTEGRITY_VIOLATION,
  ENROLLMENT_NOT_FOUND,
  MULTIPLE_ACTIVE_ENROLLMENTS,
  PAYMENT_REQUIRED,
} from '../codes/ErrorCodes.js';

/** @typedef {Record<string, unknown>} ErrorMetadata */

export class EnrollmentActivationDeniedError extends AppError {
  /** @param {ErrorMetadata|null} [metadata] */
  constructor(metadata = null) {
    super({
      message: 'Enrollment cannot be activated in its current state.',
      errorCode: ENROLLMENT_ACTIVATION_DENIED,
      httpStatus: 409,
      isOperational: true,
      metadata,
    });
  }
}

export class EnrollmentIntegrityViolationError extends AppError {
  /** @param {ErrorMetadata|null} [metadata] */
  constructor(metadata = null) {
    super({
      message: 'Enrollment integrity check failed after state transition.',
      errorCode: ENROLLMENT_INTEGRITY_VIOLATION,
      httpStatus: 500,
      isOperational: false,
      metadata,
    });
  }
}

export class EnrollmentLifecycleNotFoundError extends AppError {
  /** @param {ErrorMetadata|null} [metadata] */
  constructor(metadata = null) {
    super({
      message: 'Enrollment not found.',
      errorCode: ENROLLMENT_NOT_FOUND,
      httpStatus: 404,
      isOperational: true,
      metadata,
    });
  }
}

export class EnrollmentPaymentRequiredError extends AppError {
  /** @param {ErrorMetadata|null} [metadata] */
  constructor(metadata = null) {
    super({
      message: 'Payment must be confirmed before enrollment activation.',
      errorCode: PAYMENT_REQUIRED,
      httpStatus: 402,
      isOperational: true,
      metadata,
    });
  }
}

export class EnrollmentRevokedStateError extends AppError {
  /** @param {ErrorMetadata|null} [metadata] */
  constructor(metadata = null) {
    super({
      message: 'This enrollment has been revoked and cannot be activated.',
      errorCode: ACCESS_REVOKED,
      httpStatus: 403,
      isOperational: true,
      metadata,
    });
  }
}

export class EnrollmentRaceIntegrityError extends AppError {
  /** @param {ErrorMetadata|null} [metadata] */
  constructor(metadata = null) {
    super({
      message: 'Concurrent enrollment activation detected — integrity violated.',
      errorCode: MULTIPLE_ACTIVE_ENROLLMENTS,
      httpStatus: 409,
      isOperational: true,
      metadata,
    });
  }
}
