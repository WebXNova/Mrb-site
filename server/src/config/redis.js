import { createClient } from 'redis';
import { env } from './env.js';
import { isProductionNodeEnv } from './validateProductionStartup.js';
import { logSafepayWebhookRedisRecovery } from '../services/safepayWebhookReplayMetrics.service.js';
import { REDIS_COMMAND_TIMEOUT_MS, REDIS_CONNECT_TIMEOUT_MS } from './reliabilityTimeouts.js';
import { installRedisCommandTimeouts } from './redisCommandTimeout.js';

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

function logRedisEvent(level, message, extra = {}) {
  const payload = { tag: '[redis]', message, ...extra };
  if (level === 'error') {
    console.error(payload);
    return;
  }
  if (level === 'warn') {
    console.warn(payload);
    return;
  }
  console.log(payload);
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

  redisClient = createClient({
    url,
    socket: {
      connectTimeout: REDIS_CONNECT_TIMEOUT_MS,
      reconnectStrategy(retries) {
        const delay = Math.min(retries * 200, 2_000);
        logRedisEvent('warn', 'reconnecting', { retries, delayMs: delay });
        return delay;
      },
    },
  });
  redisClient.on('error', (error) => {
    hadRedisError = true;
    redisReady = false;
    logRedisEvent('error', 'client_error', {
      code: error?.code || null,
      err: error instanceof Error ? error.message : String(error),
    });
  });
  redisClient.on('ready', () => {
    if (hadRedisError) {
      hadRedisError = false;
      logSafepayWebhookRedisRecovery({ source: 'redis_ready' });
    }
    redisReady = true;
    logRedisEvent('warn', 'ready', { commandTimeoutMs: REDIS_COMMAND_TIMEOUT_MS });
  });
  redisClient.on('reconnecting', () => {
    redisReady = false;
    logRedisEvent('warn', 'reconnecting_event');
  });
  redisClient.on('end', () => {
    redisReady = false;
    hadRedisError = true;
    logRedisEvent('warn', 'connection_ended');
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

  installRedisCommandTimeouts(redisClient, REDIS_COMMAND_TIMEOUT_MS);

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
    logRedisEvent('warn', 'disconnected');
  } catch (error) {
    logRedisEvent('warn', 'disconnect_error', {
      err: error instanceof Error ? error.message : String(error),
    });
  }
}
