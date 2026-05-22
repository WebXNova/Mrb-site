import crypto from 'crypto';
import { getRedisClient } from '../config/redis.js';
import { env } from '../config/env.js';

const KEY_PREFIX = 'payments:sfpy:wh:ack:v1:';

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

/**
 * True if this exact signed payload was already fulfilled (Redis optional).
 * Safe to skip DB: first success path must have called {@link markSafepayWebhookReplayAck}.
 */
export async function isSafepayWebhookReplaySeen(digest) {
  const redis = getRedisClient();
  if (!redis) return false;
  try {
    const v = await redis.get(`${KEY_PREFIX}${digest}`);
    return v === '1';
  } catch {
    return false;
  }
}

/**
 * Mark signed payload as successfully processed (TTL-bounded). Duplicate provider retries short-circuit here.
 */
export async function markSafepayWebhookReplayAck(digest) {
  const redis = getRedisClient();
  if (!redis) return;
  const ttl = Math.max(60, Number(env.safepay.webhookReplayTtlSeconds || 86400));
  try {
    await redis.set(`${KEY_PREFIX}${digest}`, '1', { EX: ttl });
  } catch {
    /* non-fatal — DB idempotency remains authoritative */
  }
}
