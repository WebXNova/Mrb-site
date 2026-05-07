import { ApiError } from '../utils/apiError.js';
import { getRedisClient } from '../config/redis.js';
import { logActivity } from '../services/activityLog.service.js';
import { mysqlPool } from '../config/mysql.js';

const buckets = new Map();
const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS = 5;
const MAX_DELAY_MS = 3000;
const LOCK_WINDOW_SECONDS = 15 * 60;
const LOGIN_FAILURE_WINDOW_MS = 15 * 60 * 1000;
const GLOBAL_FAILURE_WINDOW_MS = 60 * 60 * 1000;
const MAX_FAILURES_PER_WINDOW = 8;
const MAX_GLOBAL_FAILURES_PER_WINDOW = 30;
const BASE_FAILURE_DELAY_MS = 120;
const IP_SWITCH_WINDOW_SECONDS = 10 * 60;
const MAX_UNIQUE_IPS_PER_IDENTIFIER_WINDOW = 5;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getClientKey(req) {
  return req.ip || req.headers['x-forwarded-for'] || 'unknown';
}

function normalizeIp(ipAddress) {
  return String(ipAddress || '').trim() || 'unknown';
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

async function escalateIdentifierRiskLevel(identifier) {
  const normalized = String(identifier || '').trim().toLowerCase();
  if (!normalized) return;
  try {
    await mysqlPool.query(
      `UPDATE users
       SET risk_level = CASE
         WHEN risk_level = 'critical' THEN 'critical'
         ELSE 'elevated'
       END
       WHERE email = ? OR username = ?
       LIMIT 1`,
      [normalized, normalized]
    );
  } catch (error) {
    if (error?.code !== 'ER_BAD_FIELD_ERROR') throw error;
  }
}

export async function assertLoginNotLocked(identifier, ipAddress = null) {
  const normalized = String(identifier || '').trim().toLowerCase();
  if (!normalized) return;
  const ip = normalizeIp(ipAddress);
  const identifierGlobalKey = `auth:lock:id:${normalized}`;
  const identifierIpKey = `auth:lock:idip:${normalized}:${ip}`;
  const redis = getRedisClient();
  if (redis) {
    const [idTtl, idIpTtl] = await Promise.all([redis.ttl(identifierGlobalKey), redis.ttl(identifierIpKey)]);
    if (idTtl > 0 || idIpTtl > 0) {
      throw new ApiError(429, 'Too many login attempts. Please try again later.');
    }
    return;
  }

  const globalEntry = buckets.get(identifierGlobalKey);
  const idIpEntry = buckets.get(identifierIpKey);
  const withinWindow = (entry) => entry && Date.now() - entry.windowStart < LOCK_WINDOW_SECONDS * 1000;
  if (withinWindow(globalEntry) || withinWindow(idIpEntry)) {
    throw new ApiError(429, 'Too many login attempts. Please try again later.');
  }
}

export async function recordLoginResult({ identifier, ipAddress = null, success, role = 'system', source = 'auth' }) {
  const normalized = String(identifier || '').trim().toLowerCase();
  if (!normalized) return;
  const ip = normalizeIp(ipAddress);

  const idIpFailureKey = `auth:fail:idip:${normalized}:${ip}`;
  const globalFailureKey = `auth:fail:id:${normalized}`;
  const idIpLockKey = `auth:lock:idip:${normalized}:${ip}`;
  const globalLockKey = `auth:lock:id:${normalized}`;
  const redis = getRedisClient();
  const distinctIpKey = `auth:ips:id:${normalized}`;

  if (success) {
    if (redis) {
      await Promise.all([
        redis.del(idIpFailureKey),
        redis.del(globalFailureKey),
        redis.del(idIpLockKey),
        redis.del(globalLockKey),
      ]);
    } else {
      buckets.delete(idIpFailureKey);
      buckets.delete(globalFailureKey);
      buckets.delete(idIpLockKey);
      buckets.delete(globalLockKey);
    }
    return;
  }

  const [idIpCounter, globalCounter] = await Promise.all([
    incrementCounter(idIpFailureKey, LOGIN_FAILURE_WINDOW_MS),
    incrementCounter(globalFailureKey, GLOBAL_FAILURE_WINDOW_MS),
  ]);
  let uniqueIpCount = 1;
  if (redis) {
    await redis.sAdd(distinctIpKey, ip);
    await redis.expire(distinctIpKey, IP_SWITCH_WINDOW_SECONDS);
    uniqueIpCount = await redis.sCard(distinctIpKey);
  } else {
    const distinctEntry = buckets.get(distinctIpKey) || { ips: new Set(), windowStart: Date.now() };
    if (Date.now() - distinctEntry.windowStart > IP_SWITCH_WINDOW_SECONDS * 1000) {
      distinctEntry.ips = new Set();
      distinctEntry.windowStart = Date.now();
    }
    distinctEntry.ips.add(ip);
    buckets.set(distinctIpKey, distinctEntry);
    uniqueIpCount = distinctEntry.ips.size;
  }
  await logActivity({
    role,
    action: `${source}.failed`,
    entityType: 'auth',
    metadata: {
      identifier: normalized,
      ipAddress: ip,
      idIpFailuresInWindow: idIpCounter.count,
      globalFailuresInWindow: globalCounter.count,
      uniqueIpCount,
    },
  });
  if (uniqueIpCount >= MAX_UNIQUE_IPS_PER_IDENTIFIER_WINDOW) {
    await escalateIdentifierRiskLevel(normalized);
    await logActivity({
      role,
      action: `${source}.ip_switching_detected`,
      entityType: 'auth',
      metadata: { identifier: normalized, uniqueIpCount, windowSeconds: IP_SWITCH_WINDOW_SECONDS },
    });
  }
  if (idIpCounter.count >= MAX_FAILURES_PER_WINDOW || globalCounter.count >= MAX_GLOBAL_FAILURES_PER_WINDOW) {
    await escalateIdentifierRiskLevel(normalized);
    if (redis) {
      await Promise.all([
        redis.set(idIpLockKey, '1', { EX: LOCK_WINDOW_SECONDS }),
        ...(globalCounter.count >= MAX_GLOBAL_FAILURES_PER_WINDOW ? [redis.set(globalLockKey, '1', { EX: LOCK_WINDOW_SECONDS })] : []),
      ]);
    } else {
      buckets.set(idIpLockKey, { count: 1, windowStart: Date.now() });
      if (globalCounter.count >= MAX_GLOBAL_FAILURES_PER_WINDOW) {
        buckets.set(globalLockKey, { count: 1, windowStart: Date.now() });
      }
    }
    await logActivity({
      role,
      action: `${source}.lockout`,
      entityType: 'auth',
      metadata: {
        identifier: normalized,
        ipAddress: ip,
        idIpFailuresInWindow: idIpCounter.count,
        globalFailuresInWindow: globalCounter.count,
        windowSeconds: LOCK_WINDOW_SECONDS,
      },
    });
  }

  const attempts = Math.max(0, idIpCounter.count - 1);
  const exponentialDelay = BASE_FAILURE_DELAY_MS * 2 ** attempts;
  const jitter = Math.floor(Math.random() * 120);
  await sleep(Math.min(exponentialDelay + jitter, MAX_DELAY_MS));
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
