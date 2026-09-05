/**
 * Graceful shutdown for PM2 SIGTERM and local dev (Ctrl+C / SIGINT).
 *
 * Production: stop accepting new connections, drain in-flight requests up to
 * HTTP_SHUTDOWN_DRAIN_MS, then force-close leftovers and tear down worker/Redis/MySQL.
 */

import { mysqlPool } from '../config/mysql.js';
import { disconnectRedis } from '../config/redis.js';
import { disconnectQueueRedis } from '../config/queue.js';
import { HTTP_SHUTDOWN_DEADLINE_MS, HTTP_SHUTDOWN_DRAIN_MS } from '../config/reliabilityTimeouts.js';
import { stopDataRetentionCleanupScheduler } from '../jobs/dataRetentionCleanupScheduler.js';
import { stopIdempotencyCleanupScheduler } from '../jobs/idempotencyCleanupScheduler.js';
import { stopQaUploadCleanupScheduler } from '../jobs/qaUploadCleanupScheduler.js';
import { stopEmailQueueWorker } from '../services/emailQueueWorker.service.js';

let shuttingDown = false;

function isDevRuntime() {
  return String(process.env.NODE_ENV || 'development') !== 'production';
}

function closeHttpServer(server, drainMs) {
  return new Promise((resolve) => {
    if (!server) {
      resolve(undefined);
      return;
    }

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve(undefined);
    };

    server.close(() => {
      console.warn('[shutdown] HTTP server closed');
      finish();
    });

    setTimeout(() => {
      if (settled) return;
      if (typeof server.closeAllConnections === 'function') {
        console.warn('[shutdown] drain window elapsed — closing remaining HTTP connections');
        server.closeAllConnections();
      }
      setTimeout(finish, 400);
    }, drainMs);
  });
}

/**
 * @param {() => import('http').Server | null} getHttpServer
 * @param {string} [signal]
 */
export async function runGracefulShutdown(getHttpServer, signal = 'shutdown') {
  if (shuttingDown) return;
  shuttingDown = true;
  console.warn(`[shutdown] Received ${signal}, draining in-flight requests…`);

  stopQaUploadCleanupScheduler();
  stopDataRetentionCleanupScheduler();
  stopIdempotencyCleanupScheduler();

  const server = getHttpServer();
  await closeHttpServer(server, HTTP_SHUTDOWN_DRAIN_MS);

  if (isDevRuntime()) {
    process.exit(0);
    return;
  }

  await stopEmailQueueWorker();
  await disconnectQueueRedis();
  await disconnectRedis();

  try {
    await mysqlPool.end();
    console.warn('[shutdown] MySQL pool closed');
  } catch (error) {
    console.warn('[shutdown] MySQL pool close error:', error?.message || error);
  }
}

/**
 * @param {() => import('http').Server | null} getHttpServer
 */
export function registerGracefulShutdownHandlers(getHttpServer) {
  const shutdown = async (signal) => {
    const deadline = new Promise((resolve) => {
      setTimeout(resolve, HTTP_SHUTDOWN_DEADLINE_MS);
    });
    await Promise.race([runGracefulShutdown(getHttpServer, signal), deadline]);
    if (String(process.env.NODE_ENV || '') === 'production' || !isDevRuntime()) {
      process.exit(0);
    }
  };

  process.once('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
  process.once('SIGINT', () => {
    void shutdown('SIGINT');
  });
}
