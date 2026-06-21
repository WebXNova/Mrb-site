import { env } from './env.js';

const DEFAULT_RETENTION_DAYS = 90;
const DEFAULT_BATCH_SIZE = 500;
const DEFAULT_BATCH_PAUSE_MS = 50;
const DEFAULT_MAX_BATCHES_PER_RUN = 200;
const DEFAULT_MAX_RETRIES_PER_BATCH = 3;
const DEFAULT_RETRY_BASE_PAUSE_MS = 200;
const DEFAULT_INTERVAL_MINUTES = 1440;

/**
 * activity_logs retention — delete rows older than retention window in bounded batches.
 *
 * Retention policy:
 * - Default: purge rows with created_at older than 90 days
 * - Batched DELETE by primary key (small LIMIT per batch) to avoid long table locks
 * - Scheduled daily in production (configurable)
 */
export function getActivityLogRetentionConfig() {
  const retentionDays = parseNumber(process.env.ACTIVITY_LOG_RETENTION_DAYS, DEFAULT_RETENTION_DAYS);
  const batchSize = parseNumber(process.env.ACTIVITY_LOG_RETENTION_BATCH_SIZE, DEFAULT_BATCH_SIZE);
  const batchPauseMs = parseNumber(process.env.ACTIVITY_LOG_RETENTION_BATCH_PAUSE_MS, DEFAULT_BATCH_PAUSE_MS);
  const maxBatchesPerRun = parseNumber(
    process.env.ACTIVITY_LOG_RETENTION_MAX_BATCHES_PER_RUN,
    DEFAULT_MAX_BATCHES_PER_RUN
  );
  const maxRetriesPerBatch = parseNumber(
    process.env.ACTIVITY_LOG_RETENTION_MAX_RETRIES_PER_BATCH,
    DEFAULT_MAX_RETRIES_PER_BATCH
  );
  const retryBasePauseMs = parseNumber(
    process.env.ACTIVITY_LOG_RETENTION_RETRY_BASE_PAUSE_MS,
    DEFAULT_RETRY_BASE_PAUSE_MS
  );
  const scheduleEnabled = parseBoolean(
    process.env.ACTIVITY_LOG_RETENTION_SCHEDULE_ENABLED,
    env.nodeEnv === 'production'
  );
  const intervalMinutes = parseNumber(
    process.env.ACTIVITY_LOG_RETENTION_INTERVAL_MINUTES,
    DEFAULT_INTERVAL_MINUTES
  );

  return {
    retentionDays,
    batchSize,
    batchPauseMs,
    maxBatchesPerRun,
    maxRetriesPerBatch,
    retryBasePauseMs,
    maxRowsPerRun: batchSize * maxBatchesPerRun,
    scheduleEnabled,
    intervalMinutes,
    intervalMs: intervalMinutes * 60 * 1000,
  };
}

function parseNumber(raw, fallback) {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function parseBoolean(raw, fallback) {
  if (raw === undefined || raw === null || String(raw).trim() === '') return fallback;
  const v = String(raw).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(v)) return true;
  if (['0', 'false', 'no', 'off'].includes(v)) return false;
  return fallback;
}
