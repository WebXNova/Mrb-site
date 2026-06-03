/**
 * CEE Protection Grid errors — fail-closed route enforcement.
 */

import { AppError } from '../base/AppError.js';
import { ACCESS_DENIED, CEE_UNKNOWN_PROTECTED_ROUTE, CEE_PROTECTION_GRID_MISCONFIGURED } from '../codes/ErrorCodes.js';

/** @typedef {Record<string, unknown>} ErrorMetadata */

/**
 * Runtime: request hit a protected namespace without an explicit non-public grid rule.
 */
export class CeeUnknownProtectedRouteError extends AppError {
  /** @param {ErrorMetadata|null} [metadata] */
  constructor(metadata = null) {
    super({
      message: 'This API path is not registered in the Course Entitlement protection grid.',
      errorCode: CEE_UNKNOWN_PROTECTED_ROUTE,
      httpStatus: 403,
      isOperational: true,
      metadata,
    });
  }
}

/**
 * Startup: grid registry / mount manifest mismatch.
 */
export class CeeProtectionGridMisconfiguredError extends AppError {
  /** @param {ErrorMetadata|null} [metadata] */
  constructor(metadata = null) {
    super({
      message: 'CEE protection grid failed startup validation.',
      errorCode: CEE_PROTECTION_GRID_MISCONFIGURED,
      httpStatus: 500,
      isOperational: false,
      metadata,
    });
  }
}

/**
 * Generic access denied for grid policy violations.
 */
export class CeeProtectionGridDeniedError extends AppError {
  /** @param {ErrorMetadata|null} [metadata] */
  constructor(metadata = null) {
    super({
      message: 'Access to this resource was denied by the protection grid.',
      errorCode: ACCESS_DENIED,
      httpStatus: 403,
      isOperational: true,
      metadata,
    });
  }
}
