/**
 * Graceful shutdown for PM2 SIGTERM and local dev (Ctrl+C / SIGINT).
 */

import { mysqlPool } from '../config/mysql.js';
import { disconnectRedis } from '../config/redis.js';
import { stopDataRetentionCleanupScheduler } from '../jobs/dataRetentionCleanupScheduler.js';
import { stopIdempotencyCleanupScheduler } from '../jobs/idempotencyCleanupScheduler.js';
import { stopQaUploadCleanupScheduler } from '../jobs/qaUploadCleanupScheduler.js';
import { stopEmailQueueWorker } from '../services/emailQueueWorker.service.js';

let shuttingDown = false;

/**
 * @param {() => import('http').Server | null} getHttpServer
 */
export function registerGracefulShutdownHandlers(getHttpServer) {
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[shutdown] Received ${signal}, closing…`);

    stopQaUploadCleanupScheduler();
    stopDataRetentionCleanupScheduler();
    stopIdempotencyCleanupScheduler();

    const server = getHttpServer();
    if (server) {
      await new Promise((resolve) => {
        server.close(() => {
          console.log('[shutdown] HTTP server closed');
          resolve(undefined);
        });
      });
    }

    await stopEmailQueueWorker();
    await disconnectRedis();

    try {
      await mysqlPool.end();
      console.log('[shutdown] MySQL pool closed');
    } catch (error) {
      console.warn('[shutdown] MySQL pool close error:', error?.message || error);
    }

    process.exit(0);
  };

  process.once('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
  process.once('SIGINT', () => {
    void shutdown('SIGINT');
  });
}
