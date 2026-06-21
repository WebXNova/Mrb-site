/**
 * activity_logs retention metrics (Prometheus-compatible).
 */

const metrics = {
  runs_total: 0,
  deleted_total: 0,
  batches_total: 0,
  dry_runs_total: 0,
  truncated_runs_total: 0,
  expired_before_run_last: 0,
  remaining_expired_last: 0,
  retention_days_last: 90,
  cutoff_timestamp_last: null,
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
 *   retentionDays?: number,
 *   cutoff?: string,
 *   durationMs?: number,
 * }} result
 */
export function recordActivityLogRetentionRun(result) {
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
  metrics.retention_days_last = Number(result.retentionDays ?? metrics.retention_days_last);
  metrics.cutoff_timestamp_last = result.cutoff ?? metrics.cutoff_timestamp_last;
  recordDuration(result.durationMs);
}

export function getActivityLogRetentionMetricsSnapshot() {
  return {
    runs_total: metrics.runs_total,
    deleted_total: metrics.deleted_total,
    batches_total: metrics.batches_total,
    dry_runs_total: metrics.dry_runs_total,
    truncated_runs_total: metrics.truncated_runs_total,
    expired_before_run_last: metrics.expired_before_run_last,
    remaining_expired_last: metrics.remaining_expired_last,
    retention_days_last: metrics.retention_days_last,
    cutoff_timestamp_last: metrics.cutoff_timestamp_last,
    duration_ms: { ...metrics.duration_ms },
  };
}

export function formatActivityLogRetentionMetricsPrometheus() {
  const d = metrics.duration_ms;
  return [
    '# HELP activity_log_retention_runs_total activity_logs retention job executions',
    '# TYPE activity_log_retention_runs_total counter',
    `activity_log_retention_runs_total ${metrics.runs_total}`,
    '# HELP activity_log_retention_deleted_total Rows deleted from activity_logs',
    '# TYPE activity_log_retention_deleted_total counter',
    `activity_log_retention_deleted_total ${metrics.deleted_total}`,
    '# HELP activity_log_retention_batches_total DELETE batches executed',
    '# TYPE activity_log_retention_batches_total counter',
    `activity_log_retention_batches_total ${metrics.batches_total}`,
    '# HELP activity_log_retention_dry_runs_total Dry-run executions (no deletes)',
    '# TYPE activity_log_retention_dry_runs_total counter',
    `activity_log_retention_dry_runs_total ${metrics.dry_runs_total}`,
    '# HELP activity_log_retention_truncated_runs_total Runs stopped at max batch cap',
    '# TYPE activity_log_retention_truncated_runs_total counter',
    `activity_log_retention_truncated_runs_total ${metrics.truncated_runs_total}`,
    '# HELP activity_log_retention_expired_before_run_last Expired rows before last run',
    '# TYPE activity_log_retention_expired_before_run_last gauge',
    `activity_log_retention_expired_before_run_last ${metrics.expired_before_run_last}`,
    '# HELP activity_log_retention_remaining_expired_last Expired rows after last run',
    '# TYPE activity_log_retention_remaining_expired_last gauge',
    `activity_log_retention_remaining_expired_last ${metrics.remaining_expired_last}`,
    '# HELP activity_log_retention_retention_days_last Configured retention days (last run)',
    '# TYPE activity_log_retention_retention_days_last gauge',
    `activity_log_retention_retention_days_last ${metrics.retention_days_last}`,
    '# HELP activity_log_retention_duration_ms Retention job duration summary',
    '# TYPE activity_log_retention_duration_ms summary',
    `activity_log_retention_duration_ms_count ${d.count}`,
    `activity_log_retention_duration_ms_sum ${d.sum}`,
  ].join('\n');
}

export function resetActivityLogRetentionMetricsForTests() {
  metrics.runs_total = 0;
  metrics.deleted_total = 0;
  metrics.batches_total = 0;
  metrics.dry_runs_total = 0;
  metrics.truncated_runs_total = 0;
  metrics.expired_before_run_last = 0;
  metrics.remaining_expired_last = 0;
  metrics.retention_days_last = 90;
  metrics.cutoff_timestamp_last = null;
  metrics.duration_ms = { count: 0, sum: 0, min: null, max: 0, last: null };
}
