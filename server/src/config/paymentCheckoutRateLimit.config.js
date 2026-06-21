import { env } from './env.js';

/**
 * H-03 — POST /api/payments/create-session abuse protection limits.
 */
export function getPaymentCheckoutRateLimitConfig() {
  return {
    requireRedis: parseBoolean(
      process.env.PAYMENT_CHECKOUT_REQUIRE_REDIS,
      env.nodeEnv === 'production'
    ),
    globalBurst: {
      max: parseNumber(process.env.PAYMENT_CHECKOUT_GLOBAL_BURST_MAX, 50),
      windowMs: parseNumber(process.env.PAYMENT_CHECKOUT_GLOBAL_BURST_WINDOW_MS, 10_000),
    },
    user: {
      max: parseNumber(process.env.PAYMENT_CHECKOUT_USER_MAX, 3),
      windowMs: parseNumber(process.env.PAYMENT_CHECKOUT_USER_WINDOW_MS, 60_000),
    },
    enrollment: {
      max: parseNumber(process.env.PAYMENT_CHECKOUT_ENROLLMENT_MAX, 10),
      windowMs: parseNumber(process.env.PAYMENT_CHECKOUT_ENROLLMENT_WINDOW_MS, 3_600_000),
    },
  };
}

function parseNumber(raw, fallback) {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function parseBoolean(raw, fallback) {
  if (raw === undefined || raw === null || String(raw).trim() === '') return fallback;
  const v = String(raw).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(v)) return true;
  if (['0', 'false', 'no', 'off'].includes(v)) return false;
  return fallback;
}
