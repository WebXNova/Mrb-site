/**
 * Redis-backed rate limiting for test answer autosave endpoints.
 */

import { env } from '../config/env.js';
import { getAutosaveRateLimitConfig } from '../config/autosaveRateLimit.config.js';
import { isRedisReady } from '../config/redis.js';
import { isProductionNodeEnv } from '../config/validateProductionStartup.js';
import { StructuredLogger } from '../utils/requestId.js';
import { checkSlidingWindowLimit } from './slidingWindowRateLimit.service.js';

const auditLogger = new StructuredLogger({ service: 'autosaveRateLimit' });

export const AUTOSAVE_RATE_LIMIT_ENDPOINT =
  '/api/tests/:slug/attempts/:attemptId/answers';

export const AUTOSAVE_RATE_LIMIT_CODES = Object.freeze({
  REDIS_REQUIRED: 'AUTOSAVE_REDIS_REQUIRED',
  USER_PER_MINUTE: 'AUTOSAVE_USER_PER_MINUTE',
});

const KEY_PREFIX = 'rl:tests:autosave';

/** @param {number} userId */
export function buildAutosaveUserMinuteKey(userId) {
  return `${KEY_PREFIX}:user:${userId}:min`;
}

/**
 * @param {string} triggerReason
 * @param {string} errorCode
 * @param {{ retryAfterMs?: number }} [result]
 */
function buildDenial(triggerReason, errorCode, result = {}) {
  return {
    allowed: false,
    errorCode,
    triggerReason,
    retryAfterMs: Number(result.retryAfterMs ?? 0),
  };
}

/**
 * Production fail-closed when Redis is required but unavailable (no in-memory bypass).
 */
function checkRedisAvailability(config) {
  if (!config.requireRedis) {
    return null;
  }
  if (!isProductionNodeEnv(env.nodeEnv)) {
    return null;
  }
  if (isRedisReady()) {
    return null;
  }
  return buildDenial('redis_unavailable', AUTOSAVE_RATE_LIMIT_CODES.REDIS_REQUIRED, {
    retryAfterMs: 5000,
  });
}

/**
 * @param {{ userId: number }} input
 */
export async function checkAutosaveRateLimits({ userId }) {
  const config = getAutosaveRateLimitConfig();

  const redisDenial = checkRedisAvailability(config);
  if (redisDenial) {
    return redisDenial;
  }

  const minuteResult = await checkSlidingWindowLimit(
    buildAutosaveUserMinuteKey(userId),
    config.perMinute.windowMs,
    config.perMinute.max
  );
  if (!minuteResult.allowed) {
    return buildDenial(
      'user_per_minute',
      AUTOSAVE_RATE_LIMIT_CODES.USER_PER_MINUTE,
      minuteResult
    );
  }

  return { allowed: true };
}

/**
 * @param {{
 *   userId: number,
 *   endpoint?: string,
 *   errorCode: string,
 *   triggerReason: string,
 *   ipAddress?: string|null,
 * }} detail
 */
export function logAutosaveRateLimitViolation(detail) {
  auditLogger.warn('Autosave rate limit exceeded', {
    userId: detail.userId,
    endpoint: detail.endpoint ?? AUTOSAVE_RATE_LIMIT_ENDPOINT,
    ipAddress: detail.ipAddress ?? null,
    errorCode: detail.errorCode,
    triggerReason: detail.triggerReason,
    violationType: detail.triggerReason,
    timestamp: new Date().toISOString(),
  });
}
