import { ApiError } from '../utils/apiError.js';
import { env } from '../config/env.js';
import { getRedisClient } from '../config/redis.js';
import { TURNSTILE_TIMEOUT_MS } from '../config/reliabilityTimeouts.js';
import { fetchWithDeadline } from '../utils/withDeadline.js';
import { ExternalRequestTimeoutError } from '../errors/external/ExternalRequestTimeoutError.js';

const memoryCounters = new Map();

function nowMs() {
  return Date.now();
}

async function countInWindow(key, windowMs) {
  const redis = getRedisClient();
  if (redis) {
    const value = await redis.incr(key);
    if (value === 1) await redis.pExpire(key, windowMs);
    return value;
  }
  const current = memoryCounters.get(key) || { count: 0, start: nowMs() };
  if (nowMs() - current.start > windowMs) {
    current.count = 0;
    current.start = nowMs();
  }
  current.count += 1;
  memoryCounters.set(key, current);
  return current.count;
}

export async function registerAbuseSignal({ action, ipAddress }) {
  const ip = String(ipAddress || 'unknown');
  const key = `abuse:${action}:ip:${ip}`;
  const count = await countInWindow(key, 60 * 60 * 1000);
  return count >= env.verification.challengeThresholdPerIpPerHour;
}

export async function assertCaptchaIfRequired({ action, ipAddress, captchaToken }) {
  const needChallenge = await registerAbuseSignal({ action, ipAddress });
  if (!needChallenge) return;
  if (!env.abuse.captchaSecret) {
    throw new ApiError(429, 'Please retry shortly');
  }
  const token = String(captchaToken || '').trim();
  if (!token) throw new ApiError(429, 'Challenge required');

  let response;
  try {
    response = await fetchWithDeadline('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        secret: env.abuse.captchaSecret,
        response: token,
        remoteip: String(ipAddress || ''),
      }),
      timeoutMs: TURNSTILE_TIMEOUT_MS,
      dependency: 'turnstile',
    });
  } catch (error) {
    if (error instanceof ExternalRequestTimeoutError) {
      throw new ApiError(503, 'Challenge verification timed out. Please retry shortly.', {
        code: 'TURNSTILE_TIMEOUT',
        error_code: 'TURNSTILE_TIMEOUT',
      });
    }
    throw new ApiError(503, 'Challenge verification unavailable. Please retry shortly.', {
      code: 'TURNSTILE_UNAVAILABLE',
      error_code: 'TURNSTILE_UNAVAILABLE',
    });
  }

  const parsed = await response.json();
  if (!parsed?.success) {
    throw new ApiError(429, 'Challenge verification failed');
  }
}
