import IORedis from 'ioredis';
import { Queue, Worker } from 'bullmq';
import { env } from './env.js';

let connection = null;
let emailQueue = null;

function getConnection() {
  if (connection || !env.redis.url) return connection;
  connection = new IORedis(env.redis.url, { maxRetriesPerRequest: null });
  return connection;
}

export function getEmailQueue() {
  if (emailQueue || !env.redis.url) return emailQueue;
  const redis = getConnection();
  emailQueue = new Queue(env.queue.emailQueueName, { connection: redis });
  return emailQueue;
}

export function startEmailWorker(processor) {
  const redis = getConnection();
  if (!redis) return null;
  return new Worker(env.queue.emailQueueName, processor, { connection: redis });
}

