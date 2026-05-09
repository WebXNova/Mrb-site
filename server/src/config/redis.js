import { createClient } from 'redis';
import { env } from './env.js';

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
  if (!env.redis.url) return null;
  redisClient = createClient({ url: env.redis.url });
  redisClient.on('error', () => {
    hadRedisError = true;
    redisReady = false;
  });
  redisClient.on('ready', () => {
    redisReady = true;
  });
  redisClient.on('reconnecting', () => {
    redisReady = false;
  });
  redisClient.on('end', () => {
    redisReady = false;
  });
  await redisClient.connect();
  redisReady = true;
  return redisClient;
}
