import { ApiError } from '../utils/apiError.js';
import { isRedisReady } from '../config/redis.js';
import { env } from '../config/env.js';
import { isProductionNodeEnv } from '../config/validateProductionStartup.js';
import { getManualPaymentCouponValidateRateLimitConfig } from '../config/manualPaymentCouponValidateRateLimit.config.js';
import {
  checkSlidingWindowLimit,
  RateLimitRedisUnavailableError,
} from '../services/slidingWindowRateLimit.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const KEY_PREFIX = 'rl:student:manual-payments:coupon-validate';

function rateLimitUnavailableError() {
  return new ApiError(503, 'Coupon validation temporarily unavailable, please try again shortly.', {
    code: 'RATE_LIMIT_UNAVAILABLE',
  });
}

/**
 * @type {import('express').RequestHandler}
 */
export const manualPaymentCouponValidateRateLimit = asyncHandler(
  async function manualPaymentCouponValidateRateLimit(req, _res, next) {
    const config = getManualPaymentCouponValidateRateLimitConfig();
    if (config.requireRedis && isProductionNodeEnv(env.nodeEnv) && !isRedisReady()) {
      return next(rateLimitUnavailableError());
    }

    const userId = Number(req.user?.id);
    if (!Number.isInteger(userId) || userId <= 0) {
      return next();
    }

    try {
      const hourResult = await checkSlidingWindowLimit(
        `${KEY_PREFIX}:student:${userId}:hour`,
        config.studentHour.windowMs,
        config.studentHour.max
      );
      if (!hourResult.allowed) {
        _res.setHeader('Retry-After', String(Math.max(1, Math.ceil(hourResult.retryAfterMs / 1000))));
        return next(
          new ApiError(429, 'Too many coupon validation attempts. Please wait before trying again.', {
            code: 'RATE_LIMITED',
          })
        );
      }
    } catch (error) {
      if (error instanceof RateLimitRedisUnavailableError) {
        return next(rateLimitUnavailableError());
      }
      throw error;
    }

    return next();
  }
);
