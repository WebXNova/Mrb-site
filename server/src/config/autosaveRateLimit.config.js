import { env } from './env.js';

/**
 * Test answer autosave — loop / retry-storm / DB write protection.
 * Canonical: PATCH /api/tests/:slug/attempts/:attemptId/answers
 * Portal:    POST /api/student/attempts/:attemptId/answer
 * Legacy:    POST /api/attempts/:attempt_id/answers
 */
export function getAutosaveRateLimitConfig() {
  return {
    requireRedis: parseBoolean(
      process.env.AUTOSAVE_REQUIRE_REDIS,
      env.nodeEnv === 'production'
    ),
    perMinute: {
      max: parseNumber(process.env.AUTOSAVE_USER_PER_MINUTE_MAX, 30),
      windowMs: parseNumber(process.env.AUTOSAVE_USER_PER_MINUTE_WINDOW_MS, 60_000),
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
