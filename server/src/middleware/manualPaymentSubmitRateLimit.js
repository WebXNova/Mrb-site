import { ApiError } from '../utils/apiError.js';
import { getManualPaymentRateLimitConfig } from '../config/manualPaymentRateLimit.config.js';
import { isRedisReady } from '../config/redis.js';
import { env } from '../config/env.js';
import { isProductionNodeEnv } from '../config/validateProductionStartup.js';
import {
  checkSlidingWindowLimit,
  RateLimitRedisUnavailableError,
} from '../services/slidingWindowRateLimit.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

function rateLimitUnavailableError() {
  return new ApiError(503, 'Payment submission temporarily unavailable, please try again shortly.', {
    code: 'RATE_LIMIT_UNAVAILABLE',
  });
}

const KEY_PREFIX = 'rl:student:manual-payments:submit';

function parseOrderId(req) {
  const n = Number(req.params?.orderId);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * @type {import('express').RequestHandler}
 */
export const manualPaymentSubmitRateLimit = asyncHandler(async function manualPaymentSubmitRateLimit(
  req,
  _res,
  next
) {
  const config = getManualPaymentRateLimitConfig();
  if (config.requireRedis && isProductionNodeEnv(env.nodeEnv) && !isRedisReady()) {
    return next(rateLimitUnavailableError());
  }

  const userId = Number(req.user?.id);
  if (!Number.isInteger(userId) || userId <= 0) {
    return next();
  }

  try {
    const dayResult = await checkSlidingWindowLimit(
      `${KEY_PREFIX}:student:${userId}:day`,
      config.studentDay.windowMs,
      config.studentDay.max
    );
    if (!dayResult.allowed) {
      _res.setHeader('Retry-After', String(Math.max(1, Math.ceil(dayResult.retryAfterMs / 1000))));
      return next(
        new ApiError(
          429,
          'Too many payment submissions in 24 hours. Please wait before trying again, or contact support.',
          { code: 'RATE_LIMITED' }
        )
      );
    }

    const orderId = parseOrderId(req);
    if (orderId) {
      const hourResult = await checkSlidingWindowLimit(
        `${KEY_PREFIX}:order:${orderId}:hour`,
        config.orderHour.windowMs,
        config.orderHour.max
      );
      if (!hourResult.allowed) {
        _res.setHeader('Retry-After', String(Math.max(1, Math.ceil(hourResult.retryAfterMs / 1000))));
        return next(
          new ApiError(429, 'Too many submission attempts for this order. Please try again later.', {
            code: 'RATE_LIMITED',
          })
        );
      }
    }
  } catch (error) {
    if (error instanceof RateLimitRedisUnavailableError) {
      return next(rateLimitUnavailableError());
    }
    throw error;
  }

  return next();
});
