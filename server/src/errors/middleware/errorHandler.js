/**
 * Production-grade Express error middleware.
 *
 * - Normalizes AppError, legacy ApiError, and unknown exceptions
 * - Logs operational vs programmer errors differently
 * - Never leaks stack/SQL in production responses
 */

import { sanitizePath } from '../../utils/logSanitizer.js';
import { sendAppErrorResponse } from '../format/errorResponse.js';
import { isAppError, normalizeError, routeNotFoundError } from './normalizeError.js';

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export function notFoundHandler(req, res) {
  const safePath = sanitizePath(req.originalUrl);
  const err = routeNotFoundError(req.method, safePath);
  return sendAppErrorResponse(res, err, {
    requestId: req.requestId || null,
    isProd: process.env.NODE_ENV === 'production',
  });
}

/**
 * @param {unknown} err
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  const isProd = process.env.NODE_ENV === 'production';
  const requestId = req.requestId || null;
  const normalized = normalizeError(err);

  logRequestError(normalized, req, { isProd, originalError: err });

  return sendAppErrorResponse(res, normalized, { requestId, isProd });
}

/**
 * @param {import('../base/AppError.js').AppError} normalized
 * @param {import('express').Request} req
 * @param {{ isProd: boolean, originalError: unknown }} ctx
 */
function logRequestError(normalized, req, ctx) {
  const base = {
    requestId: req.requestId || null,
    method: req.method,
    path: sanitizePath(req.originalUrl),
    errorCode: normalized.errorCode,
    httpStatus: normalized.httpStatus,
    isOperational: normalized.isOperational,
    message: normalized.message,
  };

  if (normalized.isOperational && normalized.httpStatus < 500) {
    /** Expected client/security failures — info level, no stack spam */
    if (!ctx.isProd || normalized.httpStatus >= 400) {
      console.info('[http.error.operational]', base);
    }
    return;
  }

  /** Programmer bugs, infrastructure, entitlement integrity (5xx operational) */
  const payload = normalized.toLogPayload({ requestId: req.requestId || null });
  console.error('[http.error.non_operational]', payload);

  if (!isAppError(ctx.originalError) && ctx.originalError instanceof Error) {
    console.error('[http.error.original]', {
      name: ctx.originalError.name,
      message: ctx.originalError.message,
      stack: ctx.originalError.stack,
    });
  }
}

export { normalizeError, isAppError } from './normalizeError.js';
