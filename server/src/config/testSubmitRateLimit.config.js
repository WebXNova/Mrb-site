import { env } from './env.js';

/**
 * POST test submission — spam / loop / bot abuse protection.
 * Canonical: POST /api/tests/:slug/attempts/:attemptId/submit
 * Legacy:    POST /api/attempts/:attempt_id/submit
 */
export function getTestSubmitRateLimitConfig() {
  return {
    requireRedis: parseBoolean(
      process.env.TEST_SUBMIT_REQUIRE_REDIS,
      env.nodeEnv === 'production'
    ),
    perMinute: {
      max: parseNumber(process.env.TEST_SUBMIT_USER_PER_MINUTE_MAX, 10),
      windowMs: parseNumber(process.env.TEST_SUBMIT_USER_PER_MINUTE_WINDOW_MS, 60_000),
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
