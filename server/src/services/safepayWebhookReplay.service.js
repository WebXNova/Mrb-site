import crypto from 'crypto';
import { env } from '../config/env.js';
import { getRedisClient } from '../config/redis.js';
import { ApiError } from '../utils/apiError.js';

const KEY_PREFIX = 'payments:sfpy:wh:replay:v2:';
const LEGACY_KEY_PREFIX = 'payments:sfpy:wh:ack:v1:';

function parseBoolean(raw, fallback) {
  if (raw === undefined || raw === null || String(raw).trim() === '') return fallback;
  const v = String(raw).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(v)) return true;
  if (['0', 'false', 'no', 'off'].includes(v)) return false;
  return fallback;
}

export function getSafepayWebhookReplayConfig() {
  return {
    requireRedis: parseBoolean(process.env.SAFEPAY_WEBHOOK_REQUIRE_REDIS, env.nodeEnv === 'production'),
    ttlSeconds: Math.max(60, Number(env.safepay.webhookReplayTtlSeconds || 86400)),
    processingTtlSeconds: Math.max(
      30,
      Number(process.env.SAFEPAY_WEBHOOK_PROCESSING_TTL_SECONDS || 120)
    ),
  };
}

/**
 * Dedupe key: signature + timestamp + raw bytes. Collides only for identical provider retries.
 * @param {{ signatureHeader: string, timestampHeader: string, rawBodyBuffer: Buffer }} input
 * @returns {string} hex digest (64 chars)
 */
export function buildSafepayWebhookDedupeDigest({ signatureHeader, timestampHeader, rawBodyBuffer }) {
  return crypto
    .createHash('sha256')
    .update(String(signatureHeader || '').trim(), 'utf8')
    .update('\n')
    .update(String(timestampHeader || '').trim(), 'utf8')
    .update('\n')
    .update(rawBodyBuffer)
    .digest('hex');
}

function replayKey(digest) {
  return `${KEY_PREFIX}${digest}`;
}

/**
 * Layer 1 — atomic Redis SET NX claim (processing lock with TTL).
 * H-05: always fail-closed when Redis is unavailable — never return redis_unavailable.
 *
 * @param {string} digest
 * @returns {Promise<'new' | 'replay'>}
 */
export async function assertSafepayWebhookReplayClaim(digest) {
  const config = getSafepayWebhookReplayConfig();
  const redis = getRedisClient();

  if (!redis) {
    throw new ApiError(503, 'Webhook replay protection unavailable', {
      code: 'SAFEPAY_WEBHOOK_REDIS_REQUIRED',
      error_code: 'SAFEPAY_WEBHOOK_REDIS_REQUIRED',
    });
  }

  try {
    const key = replayKey(digest);
    const setResult = await redis.set(key, 'processing', {
      EX: config.processingTtlSeconds,
      NX: true,
    });
    if (setResult !== 'OK') {
      return 'replay';
    }
    return 'new';
  } catch {
    throw new ApiError(503, 'Webhook replay protection failed', {
      code: 'SAFEPAY_WEBHOOK_REDIS_ERROR',
      error_code: 'SAFEPAY_WEBHOOK_REDIS_ERROR',
    });
  }
}

/**
 * Release processing claim after retriable fulfillment failure.
 * @param {string} digest
 */
export async function releaseSafepayWebhookReplayClaim(digest) {
  const redis = getRedisClient();
  if (!redis) return;
  try {
    const key = replayKey(digest);
    const value = await redis.get(key);
    if (value === 'processing') {
      await redis.del(key);
    }
  } catch {
    /* non-fatal */
  }
}

/**
 * Mark signed payload as successfully processed (extends TTL).
 * @param {string} digest
 */
export async function markSafepayWebhookReplayAck(digest) {
  const redis = getRedisClient();
  if (!redis) return;
  const config = getSafepayWebhookReplayConfig();
  try {
    await redis.set(replayKey(digest), 'acked', { EX: config.ttlSeconds });
  } catch {
    /* non-fatal — DB ledger remains authoritative */
  }
}

/**
 * @deprecated Prefer assertSafepayWebhookReplayClaim — GET-based check allowed races.
 * @param {string} digest
 */
export async function isSafepayWebhookReplaySeen(digest) {
  const redis = getRedisClient();
  if (!redis) return false;
  try {
    const [current, legacy] = await Promise.all([
      redis.get(replayKey(digest)),
      redis.get(`${LEGACY_KEY_PREFIX}${digest}`),
    ]);
    return (
      current === 'acked' ||
      current === 'processing' ||
      current === '1' ||
      legacy === '1'
    );
  } catch {
    return false;
  }
}
