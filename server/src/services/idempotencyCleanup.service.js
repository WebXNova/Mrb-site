/**
 * idempotency_keys cleanup — bounded batch deletes for expired replay keys.
 */

import { mysqlPool } from '../config/mysql.js';
import { getIdempotencyCleanupConfig } from '../config/idempotencyCleanup.config.js';
import { recordIdempotencyCleanupRun } from '../observability/idempotencyCleanupMetrics.service.js';
import { StructuredLogger } from '../utils/requestId.js';

const auditLogger = new StructuredLogger({ service: 'idempotencyCleanup' });
const LOG_PREFIX = '[idempotency-cleanup]';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @param {import('mysql2/promise').Pool | { query: Function }} pool
 */
export async function countExpiredIdempotencyKeys(pool) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS expired_count
     FROM idempotency_keys
     WHERE expires_at < NOW()`
  );
  return Number(rows?.[0]?.expired_count ?? 0);
}

/**
 * Delete one batch of expired idempotency keys by primary key (uses idx_idempotency_expires).
 *
 * @param {import('mysql2/promise').Pool | { query: Function }} pool
 * @param {{ batchSize: number }} params
 */
export async function deleteExpiredIdempotencyKeyBatch(pool, { batchSize }) {
  const limit = Math.max(1, Number(batchSize) || 500);
  const [result] = await pool.query(
    `DELETE FROM idempotency_keys
     WHERE id IN (
       SELECT id FROM (
         SELECT id
         FROM idempotency_keys
         WHERE expires_at < NOW()
         ORDER BY id ASC
         LIMIT ?
       ) expired_rows
     )`,
    [limit]
  );
  return Number(result?.affectedRows ?? 0);
}

/**
 * @param {{
 *   dryRun?: boolean,
 *   pool?: import('mysql2/promise').Pool | { query: Function },
 *   batchSize?: number,
 *   batchPauseMs?: number,
 *   maxBatchesPerRun?: number,
 * }} [opts]
 */
export async function runIdempotencyCleanup(opts = {}) {
  const started = Date.now();
  const config = getIdempotencyCleanupConfig();
  const pool = opts.pool ?? mysqlPool;
  const dryRun = Boolean(opts.dryRun);
  const batchSize = opts.batchSize ?? config.batchSize;
  const batchPauseMs = opts.batchPauseMs ?? config.batchPauseMs;
  const maxBatchesPerRun = opts.maxBatchesPerRun ?? config.maxBatchesPerRun;

  const summary = {
    dryRun,
    batchSize,
    batches: 0,
    deleted: 0,
    expiredBeforeRun: 0,
    remainingExpired: 0,
    truncated: false,
    durationMs: 0,
  };

  summary.expiredBeforeRun = await countExpiredIdempotencyKeys(pool);

  if (dryRun) {
    summary.remainingExpired = summary.expiredBeforeRun;
    summary.durationMs = Date.now() - started;
    recordIdempotencyCleanupRun(summary);
    auditLogger.info('Idempotency cleanup dry-run', {
      expiredBeforeRun: summary.expiredBeforeRun,
      batchSize,
    });
    console.info(`${LOG_PREFIX} dry-run`, { expiredBeforeRun: summary.expiredBeforeRun });
    return summary;
  }

  while (summary.batches < maxBatchesPerRun) {
    const batchDeleted = await deleteExpiredIdempotencyKeyBatch(pool, { batchSize });
    summary.batches += 1;
    summary.deleted += batchDeleted;

    if (batchDeleted < batchSize) {
      break;
    }
    if (batchPauseMs > 0) {
      await sleep(batchPauseMs);
    }
  }

  summary.remainingExpired = await countExpiredIdempotencyKeys(pool);
  if (summary.batches >= maxBatchesPerRun && summary.remainingExpired > 0) {
    summary.truncated = true;
  }
  summary.durationMs = Date.now() - started;

  recordIdempotencyCleanupRun(summary);

  auditLogger.info('Idempotency cleanup completed', {
    deleted: summary.deleted,
    batches: summary.batches,
    expiredBeforeRun: summary.expiredBeforeRun,
    remainingExpired: summary.remainingExpired,
    truncated: summary.truncated,
    durationMs: summary.durationMs,
  });

  console.info(`${LOG_PREFIX} completed`, {
    deleted: summary.deleted,
    batches: summary.batches,
    expiredBeforeRun: summary.expiredBeforeRun,
    remainingExpired: summary.remainingExpired,
    truncated: summary.truncated,
    durationMs: summary.durationMs,
  });

  return summary;
}
