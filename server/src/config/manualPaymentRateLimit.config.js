/**
 * Rate limits for POST /api/payments/manual/:orderId/submit
 * - 5 attempts per order per hour (anti-spam)
 * - 5 attempts per student per 24 hours (fraud velocity)
 */

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

export function getManualPaymentRateLimitConfig() {
  return {
    requireRedis: parseBoolean(process.env.MANUAL_PAYMENT_RATE_LIMIT_REQUIRE_REDIS, false),
    orderHour: {
      windowMs: parseNumber(process.env.MANUAL_PAYMENT_ORDER_WINDOW_MS, 60 * 60 * 1000),
      max: parseNumber(process.env.MANUAL_PAYMENT_ORDER_MAX, 5),
    },
    studentDay: {
      windowMs: parseNumber(process.env.MANUAL_PAYMENT_STUDENT_DAY_WINDOW_MS, 24 * 60 * 60 * 1000),
      max: parseNumber(process.env.MANUAL_PAYMENT_STUDENT_DAY_MAX, 5),
    },
  };
}
