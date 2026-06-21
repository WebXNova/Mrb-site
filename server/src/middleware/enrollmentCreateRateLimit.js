/**
 * Write-storm protection for POST /api/enrollments.
 */

import { env } from '../config/env.js';
import { getEnrollmentCreateRateLimitConfig } from '../config/enrollmentCreateRateLimit.config.js';
import { isRedisReady } from '../config/redis.js';
import { isProductionNodeEnv } from '../config/validateProductionStartup.js';
import { RATE_LIMIT_EXCEEDED } from '../errors/codes/ErrorCodes.js';
import { AppError } from '../errors/base/AppError.js';
import { ApiError } from '../utils/apiError.js';
import { getClientIp } from '../utils/network.js';
import {
  checkEnrollmentCreateRateLimits,
  ENROLLMENT_CREATE_RATE_LIMIT_CODES,
  ENROLLMENT_CREATE_RATE_LIMIT_ENDPOINT,
  logEnrollmentCreateRateLimitViolation,
} from '../services/enrollmentCreateRateLimit.service.js';

/**
 * Fail closed in production when Redis is required but unavailable.
 */
export async function requireRedisForEnrollmentCreate(req, res, next) {
  const config = getEnrollmentCreateRateLimitConfig();
  if (!config.requireRedis || !isProductionNodeEnv(env.nodeEnv)) {
    return next();
  }

  if (!isRedisReady()) {
    return next(
      new ApiError(503, 'Enrollment service temporarily unavailable. Please retry shortly.', {
        code: 'ENROLLMENT_CREATE_REDIS_REQUIRED',
        error_code: 'ENROLLMENT_CREATE_REDIS_REQUIRED',
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

export async function enrollmentCreateRateLimit(req, res, next) {
  const userId = parseUserId(req);
  if (!userId) {
    return next();
  }

  const result = await checkEnrollmentCreateRateLimits({ userId });

  if (result.allowed) {
    return next();
  }

  if (result.errorCode === ENROLLMENT_CREATE_RATE_LIMIT_CODES.REDIS_REQUIRED) {
    return next(
      new ApiError(503, 'Enrollment service temporarily unavailable. Please retry shortly.', {
        code: result.errorCode,
        error_code: result.errorCode,
      })
    );
  }

  const retryAfterSec = Math.max(1, Math.ceil((result.retryAfterMs || 60_000) / 1000));
  res.setHeader('Retry-After', String(retryAfterSec));

  logEnrollmentCreateRateLimitViolation({
    userId,
    endpoint: req.originalUrl || ENROLLMENT_CREATE_RATE_LIMIT_ENDPOINT,
    errorCode: result.errorCode,
    triggerReason: result.triggerReason,
    ipAddress: getClientIp(req),
  });

  return next(
    new AppError({
      message: 'Too many enrollment requests. Please try again later.',
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
