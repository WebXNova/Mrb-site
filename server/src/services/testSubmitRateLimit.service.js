/**
 * Redis-backed rate limiting for test submission endpoints.
 */

import { env } from '../config/env.js';
import { getTestSubmitRateLimitConfig } from '../config/testSubmitRateLimit.config.js';
import { isRedisReady } from '../config/redis.js';
import { isProductionNodeEnv } from '../config/validateProductionStartup.js';
import { StructuredLogger } from '../utils/requestId.js';
import { checkSlidingWindowLimit } from './slidingWindowRateLimit.service.js';

const auditLogger = new StructuredLogger({ service: 'testSubmitRateLimit' });

export const TEST_SUBMIT_RATE_LIMIT_ENDPOINT = '/api/tests/:slug/attempts/:attemptId/submit';

export const TEST_SUBMIT_RATE_LIMIT_CODES = Object.freeze({
  REDIS_REQUIRED: 'TEST_SUBMIT_REDIS_REQUIRED',
  USER_PER_MINUTE: 'TEST_SUBMIT_USER_PER_MINUTE',
});

const KEY_PREFIX = 'rl:tests:submit';

/** @param {number} userId */
export function buildTestSubmitUserMinuteKey(userId) {
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
  return buildDenial('redis_unavailable', TEST_SUBMIT_RATE_LIMIT_CODES.REDIS_REQUIRED, {
    retryAfterMs: 5000,
  });
}

/**
 * @param {{ userId: number }} input
 */
export async function checkTestSubmitRateLimits({ userId }) {
  const config = getTestSubmitRateLimitConfig();

  const redisDenial = checkRedisAvailability(config);
  if (redisDenial) {
    return redisDenial;
  }

  const minuteResult = await checkSlidingWindowLimit(
    buildTestSubmitUserMinuteKey(userId),
    config.perMinute.windowMs,
    config.perMinute.max
  );
  if (!minuteResult.allowed) {
    return buildDenial(
      'user_per_minute',
      TEST_SUBMIT_RATE_LIMIT_CODES.USER_PER_MINUTE,
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
export function logTestSubmitRateLimitViolation(detail) {
  auditLogger.warn('Test submit rate limit exceeded', {
    userId: detail.userId,
    endpoint: detail.endpoint ?? TEST_SUBMIT_RATE_LIMIT_ENDPOINT,
    ipAddress: detail.ipAddress ?? null,
    errorCode: detail.errorCode,
    triggerReason: detail.triggerReason,
    violationType: detail.triggerReason,
    timestamp: new Date().toISOString(),
  });
}
