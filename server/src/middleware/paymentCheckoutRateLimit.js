/**
 * H-03 — Abuse protection for POST /api/payments/create-session.
 */

import { env } from '../config/env.js';
import { getPaymentCheckoutRateLimitConfig } from '../config/paymentCheckoutRateLimit.config.js';
import { isRedisReady } from '../config/redis.js';
import { isProductionNodeEnv } from '../config/validateProductionStartup.js';
import { RATE_LIMIT_EXCEEDED } from '../errors/codes/ErrorCodes.js';
import { AppError } from '../errors/base/AppError.js';
import { ApiError } from '../utils/apiError.js';
import { getClientIp } from '../utils/network.js';
import {
  checkPaymentCheckoutRateLimits,
  logPaymentCheckoutRateLimitViolation,
  PAYMENT_CHECKOUT_RATE_LIMIT_CODES,
  PAYMENT_CHECKOUT_RATE_LIMIT_ENDPOINT,
} from '../services/paymentCheckoutRateLimit.service.js';

/**
 * Fail closed in production when Redis is required but unavailable.
 */
export async function requireRedisForPaymentCheckout(req, res, next) {
  const config = getPaymentCheckoutRateLimitConfig();
  if (!config.requireRedis || !isProductionNodeEnv(env.nodeEnv)) {
    return next();
  }

  if (!isRedisReady()) {
    return next(
      new ApiError(503, 'Payment service temporarily unavailable. Please retry shortly.', {
        code: 'RATE_LIMIT_UNAVAILABLE',
        error_code: 'RATE_LIMIT_UNAVAILABLE',
      })
    );
  }

  return next();
}

/**
 * @param {import('express').Request} req
 */
function parseUserId(req) {
  const userId = Number(req.user?.id);
  return Number.isInteger(userId) && userId > 0 ? userId : null;
}

/**
 * @param {import('express').Request} req
 */
function parseEnrollmentId(req) {
  const raw = req.body?.enrollment_id ?? req.body?.enrollmentId;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function paymentCheckoutRateLimit(req, res, next) {
  const userId = parseUserId(req);
  if (!userId) {
    return next();
  }

  const enrollmentId = parseEnrollmentId(req);
  const result = await checkPaymentCheckoutRateLimits({ userId, enrollmentId });

  if (result.allowed) {
    return next();
  }

  if (result.errorCode === PAYMENT_CHECKOUT_RATE_LIMIT_CODES.REDIS_REQUIRED) {
    return next(
      new ApiError(503, 'Payment service temporarily unavailable. Please retry shortly.', {
        code: result.errorCode,
        error_code: result.errorCode,
      })
    );
  }

  const retryAfterSec = Math.max(1, Math.ceil(result.retryAfterMs / 1000));
  res.setHeader('Retry-After', String(retryAfterSec));

  logPaymentCheckoutRateLimitViolation({
    userId,
    enrollmentId,
    endpoint: req.originalUrl || PAYMENT_CHECKOUT_RATE_LIMIT_ENDPOINT,
    errorCode: result.errorCode,
    triggerReason: result.triggerReason,
    ipAddress: getClientIp(req),
  });

  return next(
    new AppError({
      message: 'Too many payment session requests. Please try again later.',
      errorCode: RATE_LIMIT_EXCEEDED,
      httpStatus: 429,
      metadata: {
        error: RATE_LIMIT_EXCEEDED,
        retryAfter: retryAfterSec,
        retry_after: retryAfterSec,
        violation_type: result.errorCode,
        trigger_reason: result.triggerReason,
      },
    })
  );
}
