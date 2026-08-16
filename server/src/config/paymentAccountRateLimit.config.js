/**
 * Rate limits for payment account mutation endpoints.
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

export function getPaymentAccountRateLimitConfig() {
  return {
    requireRedis: parseBoolean(process.env.PAYMENT_ACCOUNT_RATE_LIMIT_REQUIRE_REDIS, false),
    user: {
      windowMs: parseNumber(process.env.PAYMENT_ACCOUNT_WRITE_USER_WINDOW_MS, 60_000),
      max: parseNumber(process.env.PAYMENT_ACCOUNT_WRITE_USER_MAX, 30),
    },
    ip: {
      windowMs: parseNumber(process.env.PAYMENT_ACCOUNT_WRITE_IP_WINDOW_MS, 60_000),
      max: parseNumber(process.env.PAYMENT_ACCOUNT_WRITE_IP_MAX, 60),
    },
  };
}
