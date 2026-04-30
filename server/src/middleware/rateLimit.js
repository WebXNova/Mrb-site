import { ApiError } from '../utils/apiError.js';
import { getRedisClient } from '../config/redis.js';
import { logActivity } from '../services/activityLog.service.js';

const buckets = new Map();
const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS = 5;
const MAX_DELAY_MS = 3000;
const LOCK_WINDOW_SECONDS = 15 * 60;
const MAX_FAILURES_PER_WINDOW = 8;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getClientKey(req) {
  return req.ip || req.headers['x-forwarded-for'] || 'unknown';
}

async function incrementCounter(key, windowMs) {
  const redis = getRedisClient();
  if (redis) {
    const total = await redis.incr(key);
    if (total === 1) {
      await redis.pExpire(key, windowMs);
    }
    const ttlMs = await redis.pTTL(key);
    return {
      count: total,
      ttlMs: ttlMs > 0 ? ttlMs : windowMs,
    };
  }

  const now = Date.now();
  const current = buckets.get(key) || { count: 0, windowStart: now };
  if (now - current.windowStart > windowMs) {
    current.count = 0;
    current.windowStart = now;
  }
  current.count += 1;
  buckets.set(key, current);
  return {
    count: current.count,
    ttlMs: Math.max(0, windowMs - (now - current.windowStart)),
  };
}

export async function assertLoginNotLocked(identifier) {
  const normalized = String(identifier || '').trim().toLowerCase();
  if (!normalized) return;
  const key = `auth:lock:${normalized}`;
  const redis = getRedisClient();
  if (redis) {
    const ttl = await redis.ttl(key);
    if (ttl > 0) {
      throw new ApiError(429, 'Too many login attempts. Please try again later.');
    }
    return;
  }

  const entry = buckets.get(key);
  if (entry && Date.now() - entry.windowStart < LOCK_WINDOW_SECONDS * 1000) {
    throw new ApiError(429, 'Too many login attempts. Please try again later.');
  }
}

export async function recordLoginResult({ identifier, success, role = 'system', source = 'auth' }) {
  const normalized = String(identifier || '').trim().toLowerCase();
  if (!normalized) return;

  const failureKey = `auth:fail:${normalized}`;
  const lockKey = `auth:lock:${normalized}`;
  const redis = getRedisClient();

  if (success) {
    if (redis) {
      await redis.del(failureKey);
      await redis.del(lockKey);
    } else {
      buckets.delete(failureKey);
      buckets.delete(lockKey);
    }
    return;
  }

  const counter = await incrementCounter(failureKey, WINDOW_MS);
  await logActivity({
    role,
    action: `${source}.failed`,
    entityType: 'auth',
    metadata: { identifier: normalized, failuresInWindow: counter.count },
  });
  if (counter.count >= MAX_FAILURES_PER_WINDOW) {
    if (redis) {
      await redis.set(lockKey, '1', { EX: LOCK_WINDOW_SECONDS });
    } else {
      buckets.set(lockKey, { count: 1, windowStart: Date.now() });
    }
    await logActivity({
      role,
      action: `${source}.lockout`,
      entityType: 'auth',
      metadata: { identifier: normalized, windowSeconds: LOCK_WINDOW_SECONDS },
    });
  }
}

setInterval(() => {
  const now = Date.now();
  for (const [key, value] of buckets.entries()) {
    if (now - value.windowStart > WINDOW_MS * 2 && !key.startsWith('auth:lock:')) {
      buckets.delete(key);
    }
    if (key.startsWith('auth:lock:') && now - value.windowStart > LOCK_WINDOW_SECONDS * 1000) {
      buckets.delete(key);
    }
  }
}, WINDOW_MS).unref();

export async function authRateLimit(req, res, next) {
  const key = `${req.path}:${getClientKey(req)}`;
  const current = await incrementCounter(`auth:ip:${key}`, WINDOW_MS);

  if (current.count > MAX_REQUESTS) {
    res.setHeader('Retry-After', '60');
    await logActivity({
      role: 'system',
      action: 'auth.rate_limit',
      entityType: 'auth',
      metadata: { path: req.path, ip: getClientKey(req), count: current.count },
    });
    return next(new ApiError(429, 'Too many attempts. Please try again in a minute.'));
  }

  if (current.count > 2) {
    const delayMs = Math.min((current.count - 2) * 250, MAX_DELAY_MS);
    await sleep(delayMs);
  }

  return next();
}
