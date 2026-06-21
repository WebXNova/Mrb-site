/**
 * idempotency_keys cleanup metrics (Prometheus-compatible).
 */

const metrics = {
  runs_total: 0,
  deleted_total: 0,
  batches_total: 0,
  dry_runs_total: 0,
  truncated_runs_total: 0,
  expired_before_run_last: 0,
  remaining_expired_last: 0,
  duration_ms: {
    count: 0,
    sum: 0,
    min: null,
    max: 0,
    last: null,
  },
};

function recordDuration(ms) {
  const value = Math.max(0, Number(ms) || 0);
  const bucket = metrics.duration_ms;
  bucket.count += 1;
  bucket.sum += value;
  bucket.last = value;
  bucket.min = bucket.min == null ? value : Math.min(bucket.min, value);
  bucket.max = Math.max(bucket.max, value);
}

/**
 * @param {{
 *   dryRun?: boolean,
 *   deleted?: number,
 *   batches?: number,
 *   truncated?: boolean,
 *   expiredBeforeRun?: number,
 *   remainingExpired?: number,
 *   durationMs?: number,
 * }} result
 */
export function recordIdempotencyCleanupRun(result) {
  metrics.runs_total += 1;
  if (result.dryRun) {
    metrics.dry_runs_total += 1;
  }
  metrics.deleted_total += Number(result.deleted ?? 0);
  metrics.batches_total += Number(result.batches ?? 0);
  if (result.truncated) {
    metrics.truncated_runs_total += 1;
  }
  metrics.expired_before_run_last = Number(result.expiredBeforeRun ?? 0);
  metrics.remaining_expired_last = Number(result.remainingExpired ?? 0);
  recordDuration(result.durationMs);
}

export function getIdempotencyCleanupMetricsSnapshot() {
  return {
    runs_total: metrics.runs_total,
    deleted_total: metrics.deleted_total,
    batches_total: metrics.batches_total,
    dry_runs_total: metrics.dry_runs_total,
    truncated_runs_total: metrics.truncated_runs_total,
    expired_before_run_last: metrics.expired_before_run_last,
    remaining_expired_last: metrics.remaining_expired_last,
    duration_ms: { ...metrics.duration_ms },
  };
}

export function formatIdempotencyCleanupMetricsPrometheus() {
  const d = metrics.duration_ms;
  return [
    '# HELP idempotency_cleanup_runs_total idempotency_keys cleanup job executions',
    '# TYPE idempotency_cleanup_runs_total counter',
    `idempotency_cleanup_runs_total ${metrics.runs_total}`,
    '# HELP idempotency_cleanup_deleted_total Expired idempotency keys deleted',
    '# TYPE idempotency_cleanup_deleted_total counter',
    `idempotency_cleanup_deleted_total ${metrics.deleted_total}`,
    '# HELP idempotency_cleanup_batches_total DELETE batches executed',
    '# TYPE idempotency_cleanup_batches_total counter',
    `idempotency_cleanup_batches_total ${metrics.batches_total}`,
    '# HELP idempotency_cleanup_expired_before_run_last Expired keys before last run',
    '# TYPE idempotency_cleanup_expired_before_run_last gauge',
    `idempotency_cleanup_expired_before_run_last ${metrics.expired_before_run_last}`,
    '# HELP idempotency_cleanup_remaining_expired_last Expired keys after last run',
    '# TYPE idempotency_cleanup_remaining_expired_last gauge',
    `idempotency_cleanup_remaining_expired_last ${metrics.remaining_expired_last}`,
    '# HELP idempotency_cleanup_duration_ms Cleanup duration summary',
    '# TYPE idempotency_cleanup_duration_ms summary',
    `idempotency_cleanup_duration_ms_count ${d.count}`,
    `idempotency_cleanup_duration_ms_sum ${d.sum}`,
  ].join('\n');
}

export function resetIdempotencyCleanupMetricsForTests() {
  metrics.runs_total = 0;
  metrics.deleted_total = 0;
  metrics.batches_total = 0;
  metrics.dry_runs_total = 0;
  metrics.truncated_runs_total = 0;
  metrics.expired_before_run_last = 0;
  metrics.remaining_expired_last = 0;
  metrics.duration_ms = { count: 0, sum: 0, min: null, max: 0, last: null };
}
