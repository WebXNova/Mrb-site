/**
 * CEE scoped query enforcement errors — fail-closed DB access control.
 */

import { AppError } from '../base/AppError.js';
import {
  CEE_BYPASS_DENIED,
  CEE_INVALID_BYPASS,
  CEE_MISSING_COURSE_SCOPE,
  CEE_PROTECTED_TABLE_ACCESS,
  CEE_UNSCOPED_QUERY_DENIED,
} from '../codes/ErrorCodes.js';

/** @typedef {Record<string, unknown>} ErrorMetadata */

/**
 * Query targeted protected tables but courseId was missing/invalid.
 */
export class CeeMissingCourseScopeError extends AppError {
  /** @param {ErrorMetadata|null} [metadata] */
  constructor(metadata = null) {
    super({
      message: 'A valid course scope is required for this data access.',
      errorCode: CEE_MISSING_COURSE_SCOPE,
      httpStatus: 403,
      isOperational: true,
      metadata,
    });
  }
}

/**
 * Protected instructional table referenced without course_id scoping.
 */
export class CeeUnscopedQueryDeniedError extends AppError {
  /** @param {ErrorMetadata|null} [metadata] */
  constructor(metadata = null) {
    super({
      message: 'This data request is not allowed without course entitlement scope.',
      errorCode: CEE_UNSCOPED_QUERY_DENIED,
      httpStatus: 403,
      isOperational: true,
      metadata,
    });
  }
}

/**
 * allowUnscoped bypass requested without a valid reason string.
 */
export class CeeInvalidBypassError extends AppError {
  /** @param {ErrorMetadata|null} [metadata] */
  constructor(metadata = null) {
    super({
      message: 'Unscoped data access bypass requires an explicit audited reason.',
      errorCode: CEE_INVALID_BYPASS,
      httpStatus: 500,
      isOperational: true,
      metadata,
    });
  }
}

/**
 * Bypass requested in a forbidden context or HTTP route (student/public APIs).
 */
export class CeeBypassDeniedError extends AppError {
  /** @param {ErrorMetadata|null} [metadata] */
  constructor(metadata = null) {
    super({
      message: 'Unscoped bypass is not permitted for this API path or service context.',
      errorCode: CEE_BYPASS_DENIED,
      httpStatus: 403,
      isOperational: true,
      metadata,
    });
  }
}

/**
 * Access to a protected registry table was blocked (wrapper error).
 */
export class CeeProtectedTableAccessError extends AppError {
  /** @param {ErrorMetadata|null} [metadata] */
  constructor(metadata = null) {
    super({
      message: 'Access to protected instructional data was denied.',
      errorCode: CEE_PROTECTED_TABLE_ACCESS,
      httpStatus: 403,
      isOperational: true,
      metadata,
    });
  }
}
