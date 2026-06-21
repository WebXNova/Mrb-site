/**
 * Spam / loop protection for POST test submission endpoints.
 */

import { env } from '../config/env.js';
import { getTestSubmitRateLimitConfig } from '../config/testSubmitRateLimit.config.js';
import { isRedisReady } from '../config/redis.js';
import { isProductionNodeEnv } from '../config/validateProductionStartup.js';
import { RATE_LIMIT_EXCEEDED } from '../errors/codes/ErrorCodes.js';
import { AppError } from '../errors/base/AppError.js';
import { ApiError } from '../utils/apiError.js';
import { getClientIp } from '../utils/network.js';
import {
  checkTestSubmitRateLimits,
  logTestSubmitRateLimitViolation,
  TEST_SUBMIT_RATE_LIMIT_CODES,
  TEST_SUBMIT_RATE_LIMIT_ENDPOINT,
} from '../services/testSubmitRateLimit.service.js';

/**
 * Fail closed in production when Redis is required but unavailable.
 */
export async function requireRedisForTestSubmit(req, res, next) {
  const config = getTestSubmitRateLimitConfig();
  if (!config.requireRedis || !isProductionNodeEnv(env.nodeEnv)) {
    return next();
  }

  if (!isRedisReady()) {
    return next(
      new ApiError(503, 'Test submission service temporarily unavailable. Please retry shortly.', {
        code: 'TEST_SUBMIT_REDIS_REQUIRED',
        error_code: 'TEST_SUBMIT_REDIS_REQUIRED',
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

export async function testSubmitRateLimit(req, res, next) {
  const userId = parseUserId(req);
  if (!userId) {
    return next();
  }

  const result = await checkTestSubmitRateLimits({ userId });

  if (result.allowed) {
    return next();
  }

  if (result.errorCode === TEST_SUBMIT_RATE_LIMIT_CODES.REDIS_REQUIRED) {
    return next(
      new ApiError(503, 'Test submission service temporarily unavailable. Please retry shortly.', {
        code: result.errorCode,
        error_code: result.errorCode,
      })
    );
  }

  const retryAfterSec = Math.max(1, Math.ceil((result.retryAfterMs || 60_000) / 1000));
  res.setHeader('Retry-After', String(retryAfterSec));

  logTestSubmitRateLimitViolation({
    userId,
    endpoint: req.originalUrl || TEST_SUBMIT_RATE_LIMIT_ENDPOINT,
    errorCode: result.errorCode,
    triggerReason: result.triggerReason,
    ipAddress: getClientIp(req),
  });

  return next(
    new AppError({
      message: 'Too many test submission requests. Please try again later.',
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
