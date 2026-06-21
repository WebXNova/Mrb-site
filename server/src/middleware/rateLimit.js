import { ApiError } from '../utils/apiError.js';
import { getRedisClient, isRedisReady } from '../config/redis.js';
import { logActivity } from '../services/activityLog.service.js';
import { env } from '../config/env.js';
import { isProductionNodeEnv } from '../config/validateProductionStartup.js';
import { getClientAsn, getClientIp, getIpSubnet } from '../utils/network.js';
import { startAuthTrace } from '../utils/authProfiling.js';

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

function productionRateLimitRedisUnavailable503() {
  return new ApiError(503, 'Service temporarily unavailable. Please retry shortly.');
}

function isProductionRateLimitRedisUnavailable() {
  return isProductionNodeEnv(env.nodeEnv) && !isRedisReady();
}

function normalizeIp(ipAddress) {
  return getClientIp({ ip: ipAddress, socket: {} });
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

  if (isProductionNodeEnv(env.nodeEnv)) {
    throw productionRateLimitRedisUnavailable503();
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
    await logActivity({
      role,
      action: `${source}.ip_switching_detected`,
      entityType: 'auth',
      metadata: { identifier: normalized, uniqueIpCount, windowSeconds: IP_SWITCH_WINDOW_SECONDS },
    });
  }
  if (idIpCounter.count >= MAX_FAILURES_PER_WINDOW || globalCounter.count >= MAX_GLOBAL_FAILURES_PER_WINDOW) {
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
  const trace = startAuthTrace(`authRateLimit:${req.path}`, req);
  if (isProductionRateLimitRedisUnavailable()) {
    trace.end('redis-unavailable');
    return next(productionRateLimitRedisUnavailable503());
  }

  const ip = getClientIp(req);
  const subnet = getIpSubnet(ip);
  const key = `${req.path}:${ip}`;
  const current = await incrementCounter(`auth:ip:${key}`, WINDOW_MS);
  trace.step('incrementCounter.ip', { count: current.count });
  const subnetCurrent = await incrementCounter(`auth:subnet:${req.path}:${subnet}`, WINDOW_MS);
  trace.step('incrementCounter.subnet', { count: subnetCurrent.count });

  if (current.count > MAX_REQUESTS || subnetCurrent.count > env.verification.authPerSubnetPerMinute) {
    res.setHeader('Retry-After', '60');
    await logActivity({
      role: 'system',
      action: 'auth.rate_limit',
      entityType: 'auth',
      metadata: { path: req.path, ip, subnet, count: current.count, subnetCount: subnetCurrent.count },
    });
    trace.end('rate-limited');
    return next(new ApiError(429, 'Too many attempts. Please try again in a minute.'));
  }

  if (current.count > 2) {
    if (req.path === '/student/register' && env.security.authChallengeKey) {
      const challenge = req.get('x-auth-challenge');
      if (challenge !== env.security.authChallengeKey) {
        trace.end('challenge-required');
        return next(new ApiError(429, 'Additional signup verification required'));
      }
    }
    const delayMs = Math.min((current.count - 2) * 250, MAX_DELAY_MS);
    trace.step('sleep.beforeNext', { delayMs, count: current.count });
    await sleep(delayMs);
  }

  trace.end('ok', { count: current.count });
  return next();
}

export async function signupAbuseRateLimit(req, res, next) {
  if (isProductionRateLimitRedisUnavailable()) {
    return next(productionRateLimitRedisUnavailable503());
  }
  const ip = getClientIp(req);
  const subnet = getIpSubnet(ip);
  const asn = getClientAsn(req);
  const email = String(req.body?.email || '').trim().toLowerCase();
  const ipAllowed = await enforceSlidingLimit({
    key: `signup:ip:${ip}`,
    windowMs: 15 * 60 * 1000,
    limit: env.verification.signupPerIpPer15Min,
  });
  const subnetAllowed = await enforceSlidingLimit({
    key: `signup:subnet:${subnet}`,
    windowMs: 15 * 60 * 1000,
    limit: env.verification.signupPerSubnetPer15Min,
  });
  const asnAllowed = await enforceSlidingLimit({
    key: `signup:asn:${asn}`,
    windowMs: 15 * 60 * 1000,
    limit: env.verification.signupPerAsnPer15Min,
  });
  if (!ipAllowed || !subnetAllowed || !asnAllowed) {
    return next(new ApiError(429, 'Signup temporarily rate limited. Please try again later.'));
  }
  if (email) {
    const emailAllowed = await enforceSlidingLimit({
      key: `signup:email:${email}`,
      windowMs: 24 * 60 * 60 * 1000,
      limit: env.verification.signupPerEmailPerDay,
    });
    if (!emailAllowed) {
      return next(new ApiError(429, 'Signup temporarily rate limited. Please try again later.'));
    }
  }
  return next();
}

async function enforceSlidingLimit({ key, windowMs, limit }) {
  const allowed = await incrementCounter(key, windowMs);
  return allowed.count <= limit;
}

export async function verifyEmailRateLimit(req, res, next) {
  if (isProductionRateLimitRedisUnavailable()) {
    return next(productionRateLimitRedisUnavailable503());
  }
  const ip = getClientIp(req);
  const subnet = getIpSubnet(ip);
  const asn = getClientAsn(req);
  const ok = await enforceSlidingLimit({
    key: `verify:ip:${ip}`,
    windowMs: 60 * 1000,
    limit: env.verification.verifyPerIpPerMinute,
  });
  const subnetOk = await enforceSlidingLimit({
    key: `verify:subnet:${subnet}`,
    windowMs: 60 * 1000,
    limit: env.verification.verifyPerSubnetPerMinute,
  });
  const asnOk = await enforceSlidingLimit({
    key: `verify:asn:${asn}`,
    windowMs: 60 * 1000,
    limit: env.verification.verifyPerAsnPerMinute,
  });
  if (!ok || !subnetOk || !asnOk) {
    return next(new ApiError(429, 'Too many verification attempts. Please try again shortly.'));
  }
  return next();
}

export async function resendVerificationRateLimit(req, res, next) {
  if (isProductionRateLimitRedisUnavailable()) {
    return next(productionRateLimitRedisUnavailable503());
  }
  const ip = getClientIp(req);
  const subnet = getIpSubnet(ip);
  const asn = getClientAsn(req);
  const coarseIpAllowed = await enforceSlidingLimit({
    key: `verify:resend:ip:${ip}`,
    windowMs: 60 * 1000,
    limit: env.verification.resendCoarsePerIpPerMinute,
  });
  const subnetAllowed = await enforceSlidingLimit({
    key: `verify:resend:subnet:${subnet}`,
    windowMs: 60 * 1000,
    limit: env.verification.resendCoarsePerSubnetPerMinute,
  });
  const asnAllowed = await enforceSlidingLimit({
    key: `verify:resend:asn:${asn}`,
    windowMs: 60 * 1000,
    limit: env.verification.resendCoarsePerAsnPerMinute,
  });
  if (!coarseIpAllowed || !subnetAllowed || !asnAllowed) {
    return next(new ApiError(429, 'Too many resend attempts. Please try again later.'));
  }
  return next();
}

export async function forgotPasswordRateLimit(req, res, next) {
  if (isProductionRateLimitRedisUnavailable()) {
    return next(productionRateLimitRedisUnavailable503());
  }

  const ip = getClientIp(req);
  const subnet = getIpSubnet(ip);
  const asn = getClientAsn(req);
  const coarseIpAllowed = await enforceSlidingLimit({
    key: `pwdreset:req:ip:${ip}`,
    windowMs: 60 * 1000,
    limit: env.verification.resendCoarsePerIpPerMinute,
  });
  const subnetAllowed = await enforceSlidingLimit({
    key: `pwdreset:req:subnet:${subnet}`,
    windowMs: 60 * 1000,
    limit: env.verification.resendCoarsePerSubnetPerMinute,
  });
  const asnAllowed = await enforceSlidingLimit({
    key: `pwdreset:req:asn:${asn}`,
    windowMs: 60 * 1000,
    limit: env.verification.resendCoarsePerAsnPerMinute,
  });
  if (!coarseIpAllowed || !subnetAllowed || !asnAllowed) {
    res.setHeader('Retry-After', '60');
    await logActivity({
      role: 'system',
      action: 'password_reset.abuse.coarse_rate_limit',
      entityType: 'auth',
      metadata: { path: req.path, ip, subnet, asn },
    });
    return next(new ApiError(429, 'Too many password reset attempts. Please try again later.'));
  }
  return next();
}

export async function resetPasswordRateLimit(req, res, next) {
  if (isProductionRateLimitRedisUnavailable()) {
    return next(productionRateLimitRedisUnavailable503());
  }

  const ip = getClientIp(req);
  const subnet = getIpSubnet(ip);
  const asn = getClientAsn(req);
  const ipAllowed = await enforceSlidingLimit({
    key: `pwdreset:consume:ip:${ip}`,
    windowMs: 60 * 1000,
    limit: env.verification.verifyPerIpPerMinute,
  });
  const subnetAllowed = await enforceSlidingLimit({
    key: `pwdreset:consume:subnet:${subnet}`,
    windowMs: 60 * 1000,
    limit: env.verification.verifyPerSubnetPerMinute,
  });
  const asnAllowed = await enforceSlidingLimit({
    key: `pwdreset:consume:asn:${asn}`,
    windowMs: 60 * 1000,
    limit: env.verification.verifyPerAsnPerMinute,
  });
  if (!ipAllowed || !subnetAllowed || !asnAllowed) {
    res.setHeader('Retry-After', '60');
    await logActivity({
      role: 'system',
      action: 'password_reset.abuse.consume_rate_limit',
      entityType: 'auth',
      metadata: { path: req.path, ip, subnet, asn },
    });
    return next(new ApiError(429, 'Too many password reset attempts. Please try again shortly.'));
  }
  return next();
}

/** Per-recipient hourly cap (enumeration-safe — caller swallows denial). */
export async function consumeForgotPasswordEmailRateLimit(email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return true;
  return enforceSlidingLimit({
    key: `pwdreset:email:${normalized}`,
    windowMs: 60 * 60 * 1000,
    limit: env.passwordReset.maxPerEmailPerHour,
  });
}

export async function providerWebhookRateLimit(req, res, next) {
  if (isProductionRateLimitRedisUnavailable()) {
    return next(productionRateLimitRedisUnavailable503());
  }
  const ip = getClientIp(req);
  const allowed = await enforceSlidingLimit({
    key: `email:webhook:ip:${ip}`,
    windowMs: 60 * 1000,
    limit: env.verification.providerWebhookPerIpPerMinute,
  });
  if (!allowed) {
    return next(new ApiError(429, 'Webhook rate limited'));
  }
  return next();
}

/** Sliding window per IP for Safepay payment webhook (abuse / burst control). */
export async function safepayPaymentWebhookRateLimit(req, res, next) {
  if (isProductionRateLimitRedisUnavailable()) {
    return next(productionRateLimitRedisUnavailable503());
  }
  const ip = getClientIp(req);
  const limit = Math.max(30, Number(env.verification.safepayWebhookPerIpPerMinute || 240));
  const allowed = await enforceSlidingLimit({
    key: `payments:sfpy:webhook:ip:${ip}`,
    windowMs: 60 * 1000,
    limit,
  });
  if (!allowed) {
    res.setHeader('Retry-After', '60');
    return next(new ApiError(429, 'Payment webhook rate limited'));
  }
  return next();
}
