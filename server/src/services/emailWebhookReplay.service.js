import { getRedisClient } from '../config/redis.js';
import { getEmailWebhookRuntimeConfig } from '../security/emailWebhookConfig.js';
import { ApiError } from '../utils/apiError.js';

const KEY_PREFIX = 'webhook:email:dedupe:v1:';

/**
 * @param {string} digest
 * @returns {Promise<'new' | 'replay' | 'redis_unavailable'>}
 */
export async function assertEmailWebhookNotReplayed(digest) {
  const config = getEmailWebhookRuntimeConfig();
  const redis = getRedisClient();

  if (!redis) {
    if (config.requireRedisReplay) {
      throw new ApiError(503, 'Webhook replay protection unavailable', {
        code: 'EMAIL_WEBHOOK_REDIS_REQUIRED',
      });
    }
    return 'redis_unavailable';
  }

  try {
    const key = `${KEY_PREFIX}${digest}`;
    const ttl = Math.max(60, config.replayTtlSeconds);
    const setResult = await redis.set(key, '1', { EX: ttl, NX: true });
    if (setResult !== 'OK') {
      return 'replay';
    }
    return 'new';
  } catch {
    if (config.requireRedisReplay) {
      throw new ApiError(503, 'Webhook replay protection failed', {
        code: 'EMAIL_WEBHOOK_REDIS_ERROR',
      });
    }
    return 'redis_unavailable';
  }
}

/**
 * Mark payload processed after successful DB write (extends dedupe window).
 */
export async function markEmailWebhookProcessed(digest) {
  const config = getEmailWebhookRuntimeConfig();
  const redis = getRedisClient();
  if (!redis) return;
  try {
    const ttl = Math.max(60, config.replayTtlSeconds);
    await redis.set(`${KEY_PREFIX}${digest}`, '1', { EX: ttl });
  } catch {
    /* non-fatal */
  }
}
