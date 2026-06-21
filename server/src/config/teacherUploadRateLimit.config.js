import { env } from './env.js';

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

function parseLimit(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

/**
 * Production teacher Q&A answer upload rate limits (image vs audio).
 */
export function getTeacherUploadRateLimitConfig() {
  const cfg = env.teacherUploadRateLimit ?? {};
  const image = cfg.image ?? {};
  const audio = cfg.audio ?? {};

  return {
    requireRedis: cfg.requireRedis ?? env.nodeEnv === 'production',
    image: {
      burstSessionPerMinute: parseLimit(image.burstSessionPerMinute, 5),
      burstIpPerMinute: parseLimit(image.burstIpPerMinute, 8),
      teacherPerHour: parseLimit(image.teacherPerHour, 30),
      teacherPerDay: parseLimit(image.teacherPerDay, 100),
      ipPerHour: parseLimit(image.ipPerHour, 45),
      ipPerDay: parseLimit(image.ipPerDay, 120),
      burstWindowMs: MINUTE_MS,
      hourWindowMs: HOUR_MS,
      dayWindowMs: DAY_MS,
    },
    audio: {
      burstSessionPerMinute: parseLimit(audio.burstSessionPerMinute, 3),
      burstIpPerMinute: parseLimit(audio.burstIpPerMinute, 5),
      teacherPerHour: parseLimit(audio.teacherPerHour, 18),
      teacherPerDay: parseLimit(audio.teacherPerDay, 50),
      ipPerHour: parseLimit(audio.ipPerHour, 25),
      ipPerDay: parseLimit(audio.ipPerDay, 70),
      burstWindowMs: MINUTE_MS,
      hourWindowMs: HOUR_MS,
      dayWindowMs: DAY_MS,
    },
  };
}
