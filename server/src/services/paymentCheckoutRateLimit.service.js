/**
 * H-03 — Redis-backed rate limiting for payment checkout session creation.
 */

import { env } from '../config/env.js';
import { getPaymentCheckoutRateLimitConfig } from '../config/paymentCheckoutRateLimit.config.js';
import { isRedisReady } from '../config/redis.js';
import { isProductionNodeEnv } from '../config/validateProductionStartup.js';
import { StructuredLogger } from '../utils/requestId.js';
import {
  logPaymentSecurityEvent,
  PAYMENT_SECURITY_EVENTS,
} from './paymentSecurityEvents.js';
import { checkSlidingWindowLimit } from './slidingWindowRateLimit.service.js';

const auditLogger = new StructuredLogger({ service: 'paymentCheckoutRateLimit' });

export const PAYMENT_CHECKOUT_RATE_LIMIT_ENDPOINT = '/api/payments/create-session';

export const PAYMENT_CHECKOUT_RATE_LIMIT_CODES = Object.freeze({
  REDIS_REQUIRED: 'RATE_LIMIT_UNAVAILABLE',
  GLOBAL_BURST: 'PAYMENT_CHECKOUT_GLOBAL_BURST',
  USER: 'PAYMENT_CHECKOUT_USER_LIMIT',
  ENROLLMENT: 'PAYMENT_CHECKOUT_ENROLLMENT_LIMIT',
});

const KEY_PREFIX = 'rl:payments:checkout';

export function buildPaymentCheckoutGlobalBurstKey() {
  return `${KEY_PREFIX}:global:burst`;
}

/** @param {number} userId */
export function buildPaymentCheckoutUserKey(userId) {
  return `${KEY_PREFIX}:user:${userId}:min`;
}

/** @param {number} enrollmentId */
export function buildPaymentCheckoutEnrollmentKey(enrollmentId) {
  return `${KEY_PREFIX}:enrollment:${enrollmentId}:hour`;
}

/**
 * @param {string} triggerReason
 * @param {string} errorCode
 * @param {{ retryAfterMs: number }} result
 */
function buildDenial(triggerReason, errorCode, result) {
  return {
    allowed: false,
    errorCode,
    triggerReason,
    retryAfterMs: result.retryAfterMs,
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
  return buildDenial('redis_unavailable', PAYMENT_CHECKOUT_RATE_LIMIT_CODES.REDIS_REQUIRED, {
    retryAfterMs: 5000,
  });
}

/**
 * Evaluate layered checkout rate limits (global → user → enrollment).
 * Uses atomic Redis INCR via checkSlidingWindowLimit.
 *
 * @param {{ userId: number, enrollmentId?: number|null }} input
 */
export async function checkPaymentCheckoutRateLimits({ userId, enrollmentId = null }) {
  const config = getPaymentCheckoutRateLimitConfig();

  const redisDenial = checkRedisAvailability(config);
  if (redisDenial) {
    return redisDenial;
  }

  const globalResult = await checkSlidingWindowLimit(
    buildPaymentCheckoutGlobalBurstKey(),
    config.globalBurst.windowMs,
    config.globalBurst.max
  );
  if (!globalResult.allowed) {
    return buildDenial('global_burst', PAYMENT_CHECKOUT_RATE_LIMIT_CODES.GLOBAL_BURST, globalResult);
  }

  const userResult = await checkSlidingWindowLimit(
    buildPaymentCheckoutUserKey(userId),
    config.user.windowMs,
    config.user.max
  );
  if (!userResult.allowed) {
    return buildDenial('user_per_minute', PAYMENT_CHECKOUT_RATE_LIMIT_CODES.USER, userResult);
  }

  if (enrollmentId != null && Number.isInteger(enrollmentId) && enrollmentId > 0) {
    const enrollmentResult = await checkSlidingWindowLimit(
      buildPaymentCheckoutEnrollmentKey(enrollmentId),
      config.enrollment.windowMs,
      config.enrollment.max
    );
    if (!enrollmentResult.allowed) {
      return buildDenial(
        'enrollment_per_hour',
        PAYMENT_CHECKOUT_RATE_LIMIT_CODES.ENROLLMENT,
        enrollmentResult
      );
    }
  }

  return { allowed: true };
}

/**
 * @param {{
 *   userId: number,
 *   enrollmentId?: number|null,
 *   endpoint?: string,
 *   errorCode: string,
 *   triggerReason: string,
 *   ipAddress?: string|null,
 * }} detail
 */
export function logPaymentCheckoutRateLimitViolation(detail) {
  const payload = {
    userId: detail.userId,
    enrollmentId: detail.enrollmentId ?? null,
    endpoint: detail.endpoint ?? PAYMENT_CHECKOUT_RATE_LIMIT_ENDPOINT,
    ipAddress: detail.ipAddress ?? null,
    errorCode: detail.errorCode,
    triggerReason: detail.triggerReason,
    violationType: detail.triggerReason,
    timestamp: new Date().toISOString(),
  };

  auditLogger.warn('Payment checkout rate limit exceeded', payload);
  logPaymentSecurityEvent(PAYMENT_SECURITY_EVENTS.PAYMENT_CHECKOUT_RATE_LIMITED, payload);
}
