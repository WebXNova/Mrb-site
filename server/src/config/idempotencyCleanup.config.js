import { env } from './env.js';

const DEFAULT_BATCH_SIZE = 500;
const DEFAULT_BATCH_PAUSE_MS = 50;
const DEFAULT_MAX_BATCHES_PER_RUN = 200;
const DEFAULT_INTERVAL_MINUTES = 360;

/**
 * idempotency_keys cleanup — purge rows past expires_at in bounded batches.
 *
 * Retention policy:
 * - Keys are stored with expires_at = created + IDEMPOTENCY_TTL_HOURS (24h default)
 * - Cleanup deletes rows where expires_at < NOW()
 * - Batched DELETE by primary key uses idx_idempotency_expires
 */
export function getIdempotencyCleanupConfig() {
  const batchSize = parseNumber(process.env.IDEMPOTENCY_CLEANUP_BATCH_SIZE, DEFAULT_BATCH_SIZE);
  const batchPauseMs = parseNumber(process.env.IDEMPOTENCY_CLEANUP_BATCH_PAUSE_MS, DEFAULT_BATCH_PAUSE_MS);
  const maxBatchesPerRun = parseNumber(
    process.env.IDEMPOTENCY_CLEANUP_MAX_BATCHES_PER_RUN,
    DEFAULT_MAX_BATCHES_PER_RUN
  );
  const scheduleEnabled = parseBoolean(
    process.env.IDEMPOTENCY_CLEANUP_SCHEDULE_ENABLED,
    env.nodeEnv === 'production'
  );
  const intervalMinutes = parseNumber(
    process.env.IDEMPOTENCY_CLEANUP_INTERVAL_MINUTES,
    DEFAULT_INTERVAL_MINUTES
  );

  return {
    batchSize,
    batchPauseMs,
    maxBatchesPerRun,
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
