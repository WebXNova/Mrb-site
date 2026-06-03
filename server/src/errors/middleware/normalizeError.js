/**
 * Normalizes thrown values into AppError-compatible shapes for response building.
 */

import { AppError } from '../base/AppError.js';
import {
  BAD_REQUEST,
  CONFLICT,
  FORBIDDEN,
  GONE,
  INTERNAL_ERROR,
  MYSQL_ACCESS_DENIED,
  MYSQL_SCHEMA_INCOMPLETE,
  MYSQL_UNKNOWN_DATABASE,
  NOT_FOUND,
  PAYLOAD_TOO_LARGE,
  RATE_LIMITED,
  ROUTE_NOT_FOUND,
  SERVICE_UNAVAILABLE,
  UNAUTHORIZED,
  VALIDATION_ERROR,
} from '../codes/ErrorCodes.js';

/** @param {unknown} err */
export function isAppError(err) {
  return err instanceof AppError;
}

/**
 * Bridge legacy ApiError (utils/apiError.js) without requiring full migration.
 * @param {import('../../utils/apiError.js').ApiError} err
 */
export function fromLegacyApiError(err) {
  const httpStatus = Number(err.statusCode) || 500;
  let errorCode = err.code || null;

  if (!errorCode && err.details && typeof err.details === 'object' && typeof err.details.code === 'string') {
    errorCode = err.details.code;
  }

  if (!errorCode) {
    const byStatus = {
      400: BAD_REQUEST,
      401: UNAUTHORIZED,
      403: FORBIDDEN,
      404: NOT_FOUND,
      409: CONFLICT,
      410: GONE,
      422: VALIDATION_ERROR,
      429: RATE_LIMITED,
      503: SERVICE_UNAVAILABLE,
    };
    errorCode = byStatus[httpStatus] || INTERNAL_ERROR;
  }

  return new AppError({
    message: err.message,
    errorCode,
    httpStatus,
    isOperational: httpStatus < 500,
    metadata: err.details && typeof err.details === 'object' ? { legacyDetails: err.details } : null,
  });
}

/**
 * @param {unknown} err
 * @returns {AppError}
 */
export function normalizeError(err) {
  if (isAppError(err)) {
    return err;
  }

  /** Legacy ApiError */
  if (err && typeof err === 'object' && 'statusCode' in err && typeof err.message === 'string') {
    return fromLegacyApiError(/** @type {import('../../utils/apiError.js').ApiError} */ (err));
  }

  /** Express body-parser entity too large */
  if (err && typeof err === 'object' && err.type === 'entity.too.large') {
    return new AppError({
      message: 'Payload too large',
      errorCode: PAYLOAD_TOO_LARGE,
      httpStatus: 413,
      isOperational: true,
    });
  }

  const statusFromErr = Number(
    err && typeof err === 'object' ? err.status ?? err.statusCode : undefined
  );
  if (statusFromErr === 413) {
    return new AppError({
      message: 'Payload too large',
      errorCode: PAYLOAD_TOO_LARGE,
      httpStatus: 413,
      isOperational: true,
    });
  }

  /** MySQL bootstrap / connection failures */
  if (err && typeof err === 'object') {
    const errno = Number(err.errno);
    const code = err.code;

    if (code === 'ER_ACCESS_DENIED_ERROR' || errno === 1045) {
      return new AppError({
        message:
          'Database rejected the connection — check MYSQL_USER / MYSQL_PASSWORD in server/.env (use quotes around passwords with @ or ?) and GRANT privileges. See server/scripts/grant-mrb-app.sql.',
        errorCode: MYSQL_ACCESS_DENIED,
        httpStatus: 500,
        isOperational: false,
        metadata: { mysqlCode: code, errno },
      });
    }

    if (errno === 1049) {
      return new AppError({
        message: 'Unknown MySQL database — create MYSQL_DATABASE in MySQL or fix the name in server/.env.',
        errorCode: MYSQL_UNKNOWN_DATABASE,
        httpStatus: 500,
        isOperational: false,
        metadata: { mysqlCode: code, errno },
      });
    }

    const enrollmentsTableMissing =
      code === 'ER_NO_SUCH_TABLE' &&
      typeof err.sqlMessage === 'string' &&
      /\benrollments\b/i.test(err.sqlMessage);

    if (enrollmentsTableMissing) {
      return new AppError({
        message:
          'Enrollment registration is unavailable until the database is updated (missing enrollments table). Contact the administrator.',
        errorCode: MYSQL_SCHEMA_INCOMPLETE,
        httpStatus: 500,
        isOperational: false,
        metadata: { mysqlCode: code },
      });
    }
  }

  const message =
    err instanceof Error && typeof err.message === 'string' ? err.message : 'Internal server error';

  return new AppError({
    message,
    errorCode: INTERNAL_ERROR,
    httpStatus: 500,
    isOperational: false,
    metadata: err instanceof Error ? { originalName: err.name } : null,
    cause: err instanceof Error ? err : null,
  });
}

/**
 * @param {string} method
 * @param {string} safePath
 */
export function routeNotFoundError(method, safePath) {
  return new AppError({
    message: `Route not found: ${method} ${safePath}`,
    errorCode: ROUTE_NOT_FOUND,
    httpStatus: 404,
    isOperational: true,
    metadata: { method, path: safePath },
  });
}
