import { createClient } from 'redis';
import { env } from './env.js';

let redisClient = null;
let redisReady = false;

export function getRedisClient() {
  return redisReady ? redisClient : null;
}

export async function connectRedis() {
  if (!env.redis.url) return null;
  redisClient = createClient({ url: env.redis.url });
  redisClient.on('error', () => {
    redisReady = false;
  });
  await redisClient.connect();
  redisReady = true;
  return redisClient;
}
