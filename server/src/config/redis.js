import { createClient } from 'redis';
import { env } from './env.js';
import { isProductionNodeEnv } from './validateProductionStartup.js';
import { logSafepayWebhookRedisRecovery } from '../services/safepayWebhookReplayMetrics.service.js';

let redisClient = null;
let redisReady = false;
let hadRedisError = false;

export function getRedisClient() {
  return redisReady ? redisClient : null;
}

export function isRedisReady() {
  return redisReady;
}

export function hasRedisErrored() {
  return hadRedisError;
}

export async function connectRedis() {
  const url = String(env.redis.url || '').trim();
  const production = isProductionNodeEnv(env.nodeEnv);

  if (!url) {
    if (production) {
      throw new Error('REDIS_URL is required in production');
    }
    return null;
  }

  redisClient = createClient({ url });
  redisClient.on('error', () => {
    hadRedisError = true;
    redisReady = false;
  });
  redisClient.on('ready', () => {
    if (hadRedisError) {
      hadRedisError = false;
      logSafepayWebhookRedisRecovery({ source: 'redis_ready' });
    }
    redisReady = true;
  });
  redisClient.on('reconnecting', () => {
    redisReady = false;
  });
  redisClient.on('end', () => {
    redisReady = false;
    hadRedisError = true;
  });

  try {
    await redisClient.connect();
  } catch (error) {
    redisClient = null;
    redisReady = false;
    hadRedisError = true;
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Redis connection failed: ${message}`, { cause: error });
  }

  if (!redisClient.isReady) {
    redisClient = null;
    redisReady = false;
    hadRedisError = true;
    throw new Error('Redis connection failed: client not ready after connect');
  }

  redisReady = true;
  hadRedisError = false;
  return redisClient;
}

/** Graceful shutdown — close Redis client (PM2 SIGTERM / deploy restart). */
export async function disconnectRedis() {
  if (!redisClient) return;
  const client = redisClient;
  redisClient = null;
  redisReady = false;
  try {
    if (client.isOpen) {
      await client.quit();
    }
  } catch (error) {
    console.warn('[redis] disconnect error:', error?.message || error);
  }
}
