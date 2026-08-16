import { ApiError } from '../utils/apiError.js';
import { getPaymentAccountRateLimitConfig } from '../config/paymentAccountRateLimit.config.js';
import { isRedisReady } from '../config/redis.js';
import { env } from '../config/env.js';
import { isProductionNodeEnv } from '../config/validateProductionStartup.js';
import { checkSlidingWindowLimit } from '../services/slidingWindowRateLimit.service.js';
import { getClientIp } from '../utils/network.js';

const KEY_PREFIX = 'rl:admin:payment-accounts:write';

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export async function paymentAccountWriteRateLimit(req, res, next) {
  const config = getPaymentAccountRateLimitConfig();
  if (config.requireRedis && isProductionNodeEnv(env.nodeEnv) && !isRedisReady()) {
    return next(
      new ApiError(503, 'Payment account service temporarily unavailable. Please retry shortly.', {
        code: 'RATE_LIMIT_UNAVAILABLE',
      })
    );
  }

  const userId = Number(req.user?.id);
  const ip = getClientIp(req);

  if (Number.isInteger(userId) && userId > 0) {
    const userResult = await checkSlidingWindowLimit(
      `${KEY_PREFIX}:user:${userId}`,
      config.user.windowMs,
      config.user.max
    );
    if (!userResult.allowed) {
      const retryAfterSec = Math.max(1, Math.ceil(userResult.retryAfterMs / 1000));
      res.setHeader('Retry-After', String(retryAfterSec));
      return next(
        new ApiError(429, 'Too many payment account changes. Please try again shortly.', {
          code: 'RATE_LIMITED',
        })
      );
    }
  }

  const ipResult = await checkSlidingWindowLimit(
    `${KEY_PREFIX}:ip:${ip}`,
    config.ip.windowMs,
    config.ip.max
  );
  if (!ipResult.allowed) {
    const retryAfterSec = Math.max(1, Math.ceil(ipResult.retryAfterMs / 1000));
    res.setHeader('Retry-After', String(retryAfterSec));
    return next(
      new ApiError(429, 'Too many payment account changes. Please try again shortly.', {
        code: 'RATE_LIMITED',
      })
    );
  }

  return next();
}
