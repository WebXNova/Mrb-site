/**
 * Test attempt service-layer security errors — fail-closed CEE boundary.
 */

import { AppError } from '../base/AppError.js';
import {
  ACCESS_DENIED,
  ATTEMPT_EXPIRED,
  ATTEMPT_INVALID_STATE,
  ATTEMPT_NOT_FOUND,
  ATTEMPT_NOT_OWNED,
  ATTEMPT_TOKEN_INVALID,
  COURSE_SCOPE_VIOLATION,
  ENTITLEMENT_REQUIRED,
  NOT_FOUND,
  TEST_NOT_ACCESSIBLE,
} from '../codes/ErrorCodes.js';

/** @typedef {Record<string, unknown>} ErrorMetadata */

export class EntitlementRequiredError extends AppError {
  /** @param {ErrorMetadata|null} [metadata] */
  constructor(metadata = null) {
    super({
      message: 'Active course entitlement is required for this test operation.',
      errorCode: ENTITLEMENT_REQUIRED,
      httpStatus: 403,
      isOperational: true,
      metadata,
    });
  }
}

export class AttemptNotFoundError extends AppError {
  /** @param {ErrorMetadata|null} [metadata] */
  constructor(metadata = null) {
    super({
      message: 'Test attempt was not found.',
      errorCode: ATTEMPT_NOT_FOUND,
      httpStatus: 404,
      isOperational: true,
      metadata,
    });
  }
}

export class AttemptNotOwnedError extends AppError {
  /** @param {ErrorMetadata|null} [metadata] */
  constructor(metadata = null) {
    super({
      message: 'You do not have access to this test attempt.',
      errorCode: ATTEMPT_NOT_OWNED,
      httpStatus: 403,
      isOperational: true,
      metadata,
    });
  }
}

export class CourseScopeViolationError extends AppError {
  /** @param {ErrorMetadata|null} [metadata] */
  constructor(metadata = null) {
    super({
      message: 'This test does not belong to your entitled course.',
      errorCode: COURSE_SCOPE_VIOLATION,
      httpStatus: 403,
      isOperational: true,
      metadata,
    });
  }
}

export class TestNotAccessibleError extends AppError {
  /** @param {ErrorMetadata|null} [metadata] */
  constructor(metadata = null) {
    super({
      message: 'This test is not available for your course.',
      errorCode: TEST_NOT_ACCESSIBLE,
      httpStatus: 403,
      isOperational: true,
      metadata,
    });
  }
}

export class AttemptInvalidStateError extends AppError {
  /** @param {ErrorMetadata|null} [metadata] */
  constructor(metadata = null) {
    super({
      message: 'This test attempt cannot be modified in its current state.',
      errorCode: ATTEMPT_INVALID_STATE,
      httpStatus: 409,
      isOperational: true,
      metadata,
    });
  }
}

export class AttemptExpiredError extends AppError {
  /** @param {ErrorMetadata|null} [metadata] */
  constructor(metadata = null) {
    super({
      message: 'This test attempt has expired.',
      errorCode: ATTEMPT_EXPIRED,
      httpStatus: 410,
      isOperational: true,
      metadata,
    });
  }
}

export class AttemptTokenInvalidError extends AppError {
  /** @param {ErrorMetadata|null} [metadata] */
  constructor(metadata = null) {
    super({
      message: 'Attempt token is invalid or has been rotated.',
      errorCode: ATTEMPT_TOKEN_INVALID,
      httpStatus: 401,
      isOperational: true,
      metadata,
    });
  }
}

export class AttemptAccessDeniedError extends AppError {
  /** @param {ErrorMetadata|null} [metadata] */
  constructor(metadata = null) {
    super({
      message: 'Access to this test attempt was denied.',
      errorCode: ACCESS_DENIED,
      httpStatus: 403,
      isOperational: true,
      metadata,
    });
  }
}

/** @deprecated Bridge — use AttemptNotFoundError */
export class AttemptNotFoundLegacyError extends AppError {
  constructor(metadata = null) {
    super({
      message: 'Attempt not found',
      errorCode: NOT_FOUND,
      httpStatus: 404,
      isOperational: true,
      metadata,
    });
  }
}
