/**
 * Loop / retry-storm protection for test answer autosave endpoints.
 */

import { env } from '../config/env.js';
import { getAutosaveRateLimitConfig } from '../config/autosaveRateLimit.config.js';
import { isRedisReady } from '../config/redis.js';
import { isProductionNodeEnv } from '../config/validateProductionStartup.js';
import { RATE_LIMIT_EXCEEDED } from '../errors/codes/ErrorCodes.js';
import { AppError } from '../errors/base/AppError.js';
import { ApiError } from '../utils/apiError.js';
import { getClientIp } from '../utils/network.js';
import {
  checkAutosaveRateLimits,
  logAutosaveRateLimitViolation,
  AUTOSAVE_RATE_LIMIT_CODES,
  AUTOSAVE_RATE_LIMIT_ENDPOINT,
} from '../services/autosaveRateLimit.service.js';

/**
 * Fail closed in production when Redis is required but unavailable.
 */
export async function requireRedisForAutosave(req, res, next) {
  const config = getAutosaveRateLimitConfig();
  if (!config.requireRedis || !isProductionNodeEnv(env.nodeEnv)) {
    return next();
  }

  if (!isRedisReady()) {
    return next(
      new ApiError(503, 'Autosave service temporarily unavailable. Please retry shortly.', {
        code: 'AUTOSAVE_REDIS_REQUIRED',
        error_code: 'AUTOSAVE_REDIS_REQUIRED',
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

export async function autosaveRateLimit(req, res, next) {
  const userId = parseUserId(req);
  if (!userId) {
    return next();
  }

  const result = await checkAutosaveRateLimits({ userId });

  if (result.allowed) {
    return next();
  }

  if (result.errorCode === AUTOSAVE_RATE_LIMIT_CODES.REDIS_REQUIRED) {
    return next(
      new ApiError(503, 'Autosave service temporarily unavailable. Please retry shortly.', {
        code: result.errorCode,
        error_code: result.errorCode,
      })
    );
  }

  const retryAfterSec = Math.max(1, Math.ceil((result.retryAfterMs || 60_000) / 1000));
  res.setHeader('Retry-After', String(retryAfterSec));

  logAutosaveRateLimitViolation({
    userId,
    endpoint: req.originalUrl || AUTOSAVE_RATE_LIMIT_ENDPOINT,
    errorCode: result.errorCode,
    triggerReason: result.triggerReason,
    ipAddress: getClientIp(req),
  });

  return next(
    new AppError({
      message: 'Too many autosave requests. Please try again later.',
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
