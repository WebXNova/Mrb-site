/**
 * Rate limit config for POST /api/payments/manual/validate-coupon
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

export function getManualPaymentCouponValidateRateLimitConfig() {
  return {
    requireRedis: parseBoolean(process.env.MANUAL_PAYMENT_RATE_LIMIT_REQUIRE_REDIS, false),
    studentHour: {
      windowMs: parseNumber(process.env.MANUAL_PAYMENT_COUPON_VALIDATE_WINDOW_MS, 60 * 60 * 1000),
      max: parseNumber(process.env.MANUAL_PAYMENT_COUPON_VALIDATE_MAX, 10),
    },
  };
}
