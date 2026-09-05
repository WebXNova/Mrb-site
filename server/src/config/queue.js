import IORedis from 'ioredis';
import { Queue, Worker } from 'bullmq';
import { env } from './env.js';
import {
  BULLMQ_QUEUE_COMMAND_TIMEOUT_MS,
  BULLMQ_QUEUE_CONNECT_TIMEOUT_MS,
} from './reliabilityTimeouts.js';

let queueConnection = null;
let workerConnection = null;
let emailQueue = null;

function logQueueRedisError(label, error) {
  console.error({
    tag: '[redis.ioredis.error]',
    label,
    code: error?.code || null,
    message: error instanceof Error ? error.message : String(error),
  });
}

function attachIoredisErrorHandler(connection, label) {
  if (!connection || connection.__mrbErrorHandlerAttached) {
    return connection;
  }
  connection.on('error', (error) => {
    logQueueRedisError(label, error);
  });
  connection.__mrbErrorHandlerAttached = true;
  return connection;
}

function createQueueConnection() {
  if (queueConnection || !env.redis.url) return queueConnection;
  queueConnection = new IORedis(env.redis.url, {
    maxRetriesPerRequest: 1,
    connectTimeout: BULLMQ_QUEUE_CONNECT_TIMEOUT_MS,
    commandTimeout: BULLMQ_QUEUE_COMMAND_TIMEOUT_MS,
    enableOfflineQueue: false,
    retryStrategy(times) {
      return Math.min(times * 250, 2_000);
    },
  });
  attachIoredisErrorHandler(queueConnection, 'bullmq-queue');
  return queueConnection;
}

function createWorkerConnection() {
  if (workerConnection || !env.redis.url) return workerConnection;
  workerConnection = new IORedis(env.redis.url, {
    maxRetriesPerRequest: null,
    connectTimeout: BULLMQ_QUEUE_CONNECT_TIMEOUT_MS,
    retryStrategy(times) {
      return Math.min(times * 250, 2_000);
    },
  });
  attachIoredisErrorHandler(workerConnection, 'bullmq-worker');
  return workerConnection;
}

export function getEmailQueue() {
  if (emailQueue || !env.redis.url) return emailQueue;
  const redis = createQueueConnection();
  if (!redis) return null;
  emailQueue = new Queue(env.queue.emailQueueName, { connection: redis });
  emailQueue.on('error', (error) => {
    logQueueRedisError('bullmq-queue-events', error);
  });
  return emailQueue;
}

export function startEmailWorker(processor) {
  const redis = createWorkerConnection();
  if (!redis) return null;
  const worker = new Worker(env.queue.emailQueueName, processor, { connection: redis });
  worker.on('error', (error) => {
    logQueueRedisError('bullmq-worker', error);
  });
  return worker;
}

/** Close BullMQ Redis connections during graceful shutdown. */
export async function disconnectQueueRedis() {
  const queue = emailQueue;
  emailQueue = null;
  const qConn = queueConnection;
  const wConn = workerConnection;
  queueConnection = null;
  workerConnection = null;

  if (queue) {
    try {
      await queue.close();
    } catch (error) {
      console.warn('[email-queue] close error:', error?.message || error);
    }
  }

  for (const conn of [qConn, wConn]) {
    if (!conn) continue;
    try {
      await conn.quit();
    } catch {
      try {
        conn.disconnect();
      } catch {
        /* ignore */
      }
    }
  }
}
