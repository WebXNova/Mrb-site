/**
 * Standardized API error response builder.
 * Target envelope:
 * { success: false, error: { code, message }, requestId? }
 */

import { INTERNAL_ERROR } from '../codes/ErrorCodes.js';
import { AppError } from '../base/AppError.js';

const GENERIC_SERVER_MESSAGE = 'Internal server error';

/**
 * @param {AppError|{ errorCode?: string, code?: string, message: string, httpStatus?: number, statusCode?: number, metadata?: object|null }} error
 * @param {{ requestId?: string|null, isProd?: boolean, includeDebug?: boolean }} [ctx]
 */
export function buildErrorResponse(error, ctx = {}) {
  const { requestId = null, isProd = process.env.NODE_ENV === 'production', includeDebug = !isProd } = ctx;

  const httpStatus = Number(error.httpStatus ?? error.statusCode ?? 500);
  const errorCode = error.errorCode ?? error.code ?? INTERNAL_ERROR;

  let message = typeof error.message === 'string' ? error.message : GENERIC_SERVER_MESSAGE;
  if (isProd && httpStatus >= 500) {
    message = GENERIC_SERVER_MESSAGE;
  }

  /** @type {Record<string, unknown>} */
  const body = {
    success: false,
    error: {
      code: errorCode,
      message,
    },
  };

  if (requestId) {
    body.requestId = requestId;
  }

  if (includeDebug && !isProd) {
    if (error.metadata && typeof error.metadata === 'object') {
      body.details =
        error instanceof AppError ? error.sanitizeMetadataForClient(error.metadata) : error.metadata;
    } else if (error.details != null) {
      body.details = error.details;
    }
    if (error.stack && httpStatus >= 500) {
      body.debug = { stack: error.stack };
    }
  }

  return { httpStatus, body };
}

/**
 * @param {import('express').Response} res
 * @param {AppError|object} error
 * @param {{ requestId?: string|null, isProd?: boolean }} [ctx]
 */
export function sendAppErrorResponse(res, error, ctx = {}) {
  const { httpStatus, body } = buildErrorResponse(error, ctx);
  return res.status(httpStatus).json(body);
}
