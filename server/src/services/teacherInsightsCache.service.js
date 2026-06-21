import { getRedisClient } from '../config/redis.js';
import { env } from '../config/env.js';

const DEFAULT_TTL_MS = 60_000;
const memoryCache = new Map();

function memoryGet(key) {
  const hit = memoryCache.get(key);
  if (!hit) return null;
  if (hit.expires <= Date.now()) {
    memoryCache.delete(key);
    return null;
  }
  return hit.data;
}

function memorySet(key, data, ttlMs) {
  memoryCache.set(key, { data, expires: Date.now() + ttlMs });
}

/**
 * Lightweight read-through cache — memory first, optional Redis in production.
 *
 * @template T
 * @param {string} key
 * @param {() => Promise<T>} loader
 * @param {{ ttlMs?: number }} [options]
 * @returns {Promise<T>}
 */
export async function withTeacherInsightsCache(key, loader, { ttlMs = DEFAULT_TTL_MS } = {}) {
  const mem = memoryGet(key);
  if (mem != null) return mem;

  const redis = getRedisClient();
  if (redis) {
    try {
      const raw = await redis.get(`ti:${key}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        memorySet(key, parsed, ttlMs);
        return parsed;
      }
    } catch {
      // fall through to loader
    }
  }

  const data = await loader();
  memorySet(key, data, ttlMs);

  if (redis) {
    try {
      await redis.set(`ti:${key}`, JSON.stringify(data), { PX: ttlMs });
    } catch {
      // non-fatal
    }
  }

  if (env.nodeEnv !== 'production' && memoryCache.size > 500) {
    const oldest = memoryCache.keys().next().value;
    if (oldest) memoryCache.delete(oldest);
  }

  return data;
}

export function invalidateTeacherInsightsCache(prefix = '') {
  const needle = prefix || '';
  for (const key of memoryCache.keys()) {
    if (!needle || key.startsWith(needle)) memoryCache.delete(key);
  }
}
