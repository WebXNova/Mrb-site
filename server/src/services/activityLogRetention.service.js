/**
 * activity_logs retention — bounded batch deletes for rows older than retention window.
 *
 * Uses primary-key batched DELETE to limit lock duration and avoid production downtime.
 */

import { mysqlPool } from '../config/mysql.js';
import { getActivityLogRetentionConfig } from '../config/activityLogRetention.config.js';
import { recordActivityLogRetentionRun } from '../observability/activityLogRetentionMetrics.service.js';
import { runBatchedRetentionDeletes } from './retentionBatchRunner.js';

const LOG_PREFIX = '[activity-log-retention]';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * @param {number} retentionDays
 * @param {number} [nowMs]
 */
export function computeActivityLogRetentionCutoff(retentionDays, nowMs = Date.now()) {
  const days = Math.max(1, Number(retentionDays) || 90);
  return new Date(nowMs - days * MS_PER_DAY);
}

/**
 * @param {import('mysql2/promise').Pool | { query: Function }} pool
 * @param {Date} cutoff
 */
export async function countExpiredActivityLogs(pool, cutoff) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS expired_count
     FROM activity_logs
     WHERE created_at < ?`,
    [cutoff]
  );
  return Number(rows?.[0]?.expired_count ?? 0);
}

/**
 * Delete one batch of expired rows by primary key (indexed, bounded lock scope).
 *
 * @param {import('mysql2/promise').Pool | { query: Function }} pool
 * @param {{ cutoff: Date, batchSize: number }} params
 */
export async function deleteExpiredActivityLogBatch(pool, { cutoff, batchSize }) {
  const limit = Math.max(1, Number(batchSize) || 500);
  const [result] = await pool.query(
    `DELETE FROM activity_logs
     WHERE id IN (
       SELECT id FROM (
         SELECT id
         FROM activity_logs
         WHERE created_at < ?
         ORDER BY id ASC
         LIMIT ?
       ) expired_rows
     )`,
    [cutoff, limit]
  );
  return Number(result?.affectedRows ?? 0);
}

/**
 * @param {{
 *   dryRun?: boolean,
 *   pool?: import('mysql2/promise').Pool | { query: Function },
 *   nowMs?: number,
 *   retentionDays?: number,
 *   batchSize?: number,
 *   batchPauseMs?: number,
 *   maxBatchesPerRun?: number,
 *   maxRetriesPerBatch?: number,
 * }} [opts]
 */
export async function runActivityLogRetention(opts = {}) {
  const started = Date.now();
  const config = getActivityLogRetentionConfig();
  const pool = opts.pool ?? mysqlPool;
  const dryRun = Boolean(opts.dryRun);
  const retentionDays = opts.retentionDays ?? config.retentionDays;
  const batchSize = opts.batchSize ?? config.batchSize;
  const batchPauseMs = opts.batchPauseMs ?? config.batchPauseMs;
  const maxBatchesPerRun = opts.maxBatchesPerRun ?? config.maxBatchesPerRun;
  const maxRetriesPerBatch = opts.maxRetriesPerBatch ?? config.maxRetriesPerBatch;
  const cutoff = computeActivityLogRetentionCutoff(retentionDays, opts.nowMs);

  const summary = {
    dryRun,
    retentionDays,
    cutoff: cutoff.toISOString(),
    batchSize,
    batches: 0,
    deleted: 0,
    expiredBeforeRun: 0,
    remainingExpired: 0,
    truncated: false,
    retriedBatches: 0,
    durationMs: 0,
  };

  summary.expiredBeforeRun = await countExpiredActivityLogs(pool, cutoff);

  if (dryRun) {
    summary.remainingExpired = summary.expiredBeforeRun;
    summary.durationMs = Date.now() - started;
    recordActivityLogRetentionRun(summary);
    console.info(`${LOG_PREFIX} dry-run`, {
      expiredBeforeRun: summary.expiredBeforeRun,
      cutoff: summary.cutoff,
      retentionDays,
    });
    return summary;
  }

  const batchResult = await runBatchedRetentionDeletes({
    deleteBatch: (limit) => deleteExpiredActivityLogBatch(pool, { cutoff, batchSize: limit }),
    batchSize,
    batchPauseMs,
    maxBatchesPerRun,
    maxRetriesPerBatch,
    retryBasePauseMs: config.retryBasePauseMs,
  });

  summary.batches = batchResult.batches;
  summary.deleted = batchResult.deleted;
  summary.retriedBatches = batchResult.retriedBatches;
  summary.truncated = batchResult.truncated;

  summary.remainingExpired = await countExpiredActivityLogs(pool, cutoff);
  if (summary.truncated && summary.remainingExpired > 0) {
    summary.truncated = true;
  } else if (summary.remainingExpired === 0) {
    summary.truncated = false;
  }
  summary.durationMs = Date.now() - started;

  recordActivityLogRetentionRun(summary);

  console.info(`${LOG_PREFIX} completed`, {
    deleted: summary.deleted,
    batches: summary.batches,
    expiredBeforeRun: summary.expiredBeforeRun,
    remainingExpired: summary.remainingExpired,
    truncated: summary.truncated,
    retriedBatches: summary.retriedBatches,
    durationMs: summary.durationMs,
  });

  return summary;
}
