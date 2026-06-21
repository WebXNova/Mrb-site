/**
 * Redis-backed rate limiting for POST /api/enrollments (create + draft).
 */

import { env } from '../config/env.js';
import { getEnrollmentCreateRateLimitConfig } from '../config/enrollmentCreateRateLimit.config.js';
import { isRedisReady } from '../config/redis.js';
import { isProductionNodeEnv } from '../config/validateProductionStartup.js';
import { StructuredLogger } from '../utils/requestId.js';
import { checkSlidingWindowLimit } from './slidingWindowRateLimit.service.js';

const auditLogger = new StructuredLogger({ service: 'enrollmentCreateRateLimit' });

export const ENROLLMENT_CREATE_RATE_LIMIT_ENDPOINT = '/api/enrollments';

export const ENROLLMENT_CREATE_RATE_LIMIT_CODES = Object.freeze({
  REDIS_REQUIRED: 'ENROLLMENT_CREATE_REDIS_REQUIRED',
  USER_PER_MINUTE: 'ENROLLMENT_CREATE_USER_PER_MINUTE',
  USER_PER_HOUR: 'ENROLLMENT_CREATE_USER_PER_HOUR',
});

const KEY_PREFIX = 'rl:enrollments:create';

/** @param {number} userId */
export function buildEnrollmentCreateUserMinuteKey(userId) {
  return `${KEY_PREFIX}:user:${userId}:min`;
}

/** @param {number} userId */
export function buildEnrollmentCreateUserHourKey(userId) {
  return `${KEY_PREFIX}:user:${userId}:hour`;
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
  return buildDenial('redis_unavailable', ENROLLMENT_CREATE_RATE_LIMIT_CODES.REDIS_REQUIRED, {
    retryAfterMs: 5000,
  });
}

/**
 * @param {{ userId: number }} input
 */
export async function checkEnrollmentCreateRateLimits({ userId }) {
  const config = getEnrollmentCreateRateLimitConfig();

  const redisDenial = checkRedisAvailability(config);
  if (redisDenial) {
    return redisDenial;
  }

  const minuteResult = await checkSlidingWindowLimit(
    buildEnrollmentCreateUserMinuteKey(userId),
    config.perMinute.windowMs,
    config.perMinute.max
  );
  if (!minuteResult.allowed) {
    return buildDenial(
      'user_per_minute',
      ENROLLMENT_CREATE_RATE_LIMIT_CODES.USER_PER_MINUTE,
      minuteResult
    );
  }

  const hourResult = await checkSlidingWindowLimit(
    buildEnrollmentCreateUserHourKey(userId),
    config.perHour.windowMs,
    config.perHour.max
  );
  if (!hourResult.allowed) {
    return buildDenial(
      'user_per_hour',
      ENROLLMENT_CREATE_RATE_LIMIT_CODES.USER_PER_HOUR,
      hourResult
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
export function logEnrollmentCreateRateLimitViolation(detail) {
  auditLogger.warn('Enrollment create rate limit exceeded', {
    userId: detail.userId,
    endpoint: detail.endpoint ?? ENROLLMENT_CREATE_RATE_LIMIT_ENDPOINT,
    ipAddress: detail.ipAddress ?? null,
    errorCode: detail.errorCode,
    triggerReason: detail.triggerReason,
    violationType: detail.triggerReason,
    timestamp: new Date().toISOString(),
  });
}
