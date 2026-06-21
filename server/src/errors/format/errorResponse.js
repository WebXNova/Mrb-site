/**
 * Standardized API error response builder.
 * Target envelope:
 * { success: false, error: { code, message }, requestId? }
 */

import {
  DRAFT_VERSION_CONFLICT,
  INTERNAL_ERROR,
  INVALID_MCQ_FOR_PUBLISH,
  PAYMENT_CHECKOUT_ENROLLMENT_LIMIT,
  PAYMENT_CHECKOUT_GLOBAL_BURST,
  PAYMENT_CHECKOUT_USER_LIMIT,
  RATE_LIMIT_EXCEEDED,
  VALIDATION_ERROR,
} from '../codes/ErrorCodes.js';
import { AppError } from '../base/AppError.js';
import { MCQ_ERROR_CODES } from '../../validation/mcq/mcqValidation.constants.js';

/** Operational error codes that expose sanitized `details` in production. */
const CLIENT_SAFE_DETAIL_CODES = new Set([
  DRAFT_VERSION_CONFLICT,
  VALIDATION_ERROR,
  INVALID_MCQ_FOR_PUBLISH,
  PAYMENT_CHECKOUT_GLOBAL_BURST,
  PAYMENT_CHECKOUT_USER_LIMIT,
  PAYMENT_CHECKOUT_ENROLLMENT_LIMIT,
  RATE_LIMIT_EXCEEDED,
  ...Object.values(MCQ_ERROR_CODES),
]);

/**
 * @param {string} errorCode
 */
function shouldExposeClientDetails(errorCode) {
  if (CLIENT_SAFE_DETAIL_CODES.has(errorCode)) return true;
  return String(errorCode || '').startsWith('MCQ_');
}

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

  if (error instanceof AppError && shouldExposeClientDetails(errorCode) && error.metadata) {
    body.details = error.sanitizeMetadataForClient(error.metadata);
  } else if (includeDebug && !isProd) {
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
