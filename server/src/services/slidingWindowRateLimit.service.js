import { getRedisClient, isRedisReady } from '../config/redis.js';
import { env } from '../config/env.js';
import { isProductionNodeEnv } from '../config/validateProductionStartup.js';

/** Thrown when production rate limiting cannot use Redis (no in-memory bypass). */
export class RateLimitRedisUnavailableError extends Error {
  constructor() {
    super('RATE_LIMIT_REDIS_UNAVAILABLE');
    this.name = 'RateLimitRedisUnavailableError';
  }
}

function assertProductionRedisForSlidingWindow() {
  if (isProductionNodeEnv(env.nodeEnv) && !isRedisReady()) {
    throw new RateLimitRedisUnavailableError();
  }
}

/** @type {Map<string, { count: number, windowStart: number }>} */
const memoryBuckets = new Map();
/** @type {Map<string, Promise<void>>} */
const memoryKeyLocks = new Map();

const MEMORY_SWEEP_MS = 60_000;

async function withMemoryKeyLock(key, fn) {
  const prev = memoryKeyLocks.get(key) ?? Promise.resolve();
  let release = () => {};
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  memoryKeyLocks.set(key, prev.then(() => gate));
  await prev;
  try {
    return await fn();
  } finally {
    release();
  }
}

setInterval(() => {
  const now = Date.now();
  for (const [key, value] of memoryBuckets.entries()) {
    if (now - value.windowStart > value.windowMs * 2) {
      memoryBuckets.delete(key);
      memoryKeyLocks.delete(key);
    }
  }
}, MEMORY_SWEEP_MS).unref();

/**
 * Increment a fixed-window counter (Redis INCR + PTTL, in-memory fallback).
 *
 * @param {string} key
 * @param {number} windowMs
 * @returns {Promise<{ count: number, ttlMs: number }>}
 */
export async function incrementSlidingWindow(key, windowMs) {
  const redis = getRedisClient();
  if (redis) {
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.pExpire(key, windowMs);
    }
    const ttlMs = await redis.pTTL(key);
    return {
      count,
      ttlMs: ttlMs > 0 ? ttlMs : windowMs,
    };
  }

  assertProductionRedisForSlidingWindow();

  return withMemoryKeyLock(key, async () => {
    const tick = Date.now();
    const current = memoryBuckets.get(key) || { count: 0, windowStart: tick, windowMs };
    if (tick - current.windowStart > windowMs) {
      current.count = 0;
      current.windowStart = tick;
      current.windowMs = windowMs;
    }
    current.count += 1;
    memoryBuckets.set(key, current);
    return {
      count: current.count,
      ttlMs: Math.max(0, windowMs - (tick - current.windowStart)),
    };
  });
}

/**
 * @param {string} key
 * @param {number} windowMs
 * @param {number} max
 * @returns {Promise<{ allowed: boolean, count: number, remaining: number, retryAfterMs: number }>}
 */
export async function checkSlidingWindowLimit(key, windowMs, max) {
  const { count, ttlMs } = await incrementSlidingWindow(key, windowMs);
  const allowed = count <= max;
  return {
    allowed,
    count,
    remaining: Math.max(0, max - count),
    retryAfterMs: allowed ? 0 : ttlMs > 0 ? ttlMs : windowMs,
  };
}

export function resetSlidingWindowMemoryForTests() {
  memoryBuckets.clear();
  memoryKeyLocks.clear();
}
