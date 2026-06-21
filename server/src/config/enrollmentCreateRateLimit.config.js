import { env } from './env.js';

/**
 * POST /api/enrollments — enrollment creation write-storm protection.
 */
export function getEnrollmentCreateRateLimitConfig() {
  return {
    requireRedis: parseBoolean(
      process.env.ENROLLMENT_CREATE_REQUIRE_REDIS,
      env.nodeEnv === 'production'
    ),
    perMinute: {
      max: parseNumber(process.env.ENROLLMENT_CREATE_USER_PER_MINUTE_MAX, 5),
      windowMs: parseNumber(process.env.ENROLLMENT_CREATE_USER_PER_MINUTE_WINDOW_MS, 60_000),
    },
    perHour: {
      max: parseNumber(process.env.ENROLLMENT_CREATE_USER_PER_HOUR_MAX, 20),
      windowMs: parseNumber(process.env.ENROLLMENT_CREATE_USER_PER_HOUR_WINDOW_MS, 3_600_000),
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
