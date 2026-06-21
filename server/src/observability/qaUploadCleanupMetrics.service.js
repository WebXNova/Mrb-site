/**
 * Q&A orphan upload cleanup metrics (Prometheus-compatible).
 */

const metrics = {
  runs_total: 0,
  candidates_total: 0,
  quarantined_total: 0,
  deleted_total: 0,
  skipped_referenced_total: 0,
  skipped_young_total: 0,
  skipped_error_total: 0,
  purge_deleted_total: 0,
  duration_ms: {
    count: 0,
    sum: 0,
    min: null,
    max: 0,
    last: null,
  },
  /** @type {Map<string, number>} */
  by_namespace: new Map(),
  /** @type {Map<string, number>} */
  by_reason: new Map(),
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
 *   durationMs: number,
 *   candidates?: number,
 *   quarantined?: number,
 *   deleted?: number,
 *   skippedReferenced?: number,
 *   skippedYoung?: number,
 *   skippedError?: number,
 *   purgeDeleted?: number,
 *   byNamespace?: Record<string, number>,
 *   byReason?: Record<string, number>,
 * }} result
 */
export function recordQaUploadCleanupRun(result) {
  metrics.runs_total += 1;
  metrics.candidates_total += Number(result.candidates ?? 0);
  metrics.quarantined_total += Number(result.quarantined ?? 0);
  metrics.deleted_total += Number(result.deleted ?? 0);
  metrics.skipped_referenced_total += Number(result.skippedReferenced ?? 0);
  metrics.skipped_young_total += Number(result.skippedYoung ?? 0);
  metrics.skipped_error_total += Number(result.skippedError ?? 0);
  metrics.purge_deleted_total += Number(result.purgeDeleted ?? 0);
  recordDuration(result.durationMs);

  for (const [ns, count] of Object.entries(result.byNamespace || {})) {
    metrics.by_namespace.set(ns, (metrics.by_namespace.get(ns) ?? 0) + Number(count));
  }
  for (const [reason, count] of Object.entries(result.byReason || {})) {
    metrics.by_reason.set(reason, (metrics.by_reason.get(reason) ?? 0) + Number(count));
  }
}

export function getQaUploadCleanupMetricsSnapshot() {
  return {
    runs_total: metrics.runs_total,
    candidates_total: metrics.candidates_total,
    quarantined_total: metrics.quarantined_total,
    deleted_total: metrics.deleted_total,
    skipped_referenced_total: metrics.skipped_referenced_total,
    skipped_young_total: metrics.skipped_young_total,
    skipped_error_total: metrics.skipped_error_total,
    purge_deleted_total: metrics.purge_deleted_total,
    duration_ms: { ...metrics.duration_ms },
    by_namespace: Object.fromEntries(metrics.by_namespace.entries()),
    by_reason: Object.fromEntries(metrics.by_reason.entries()),
  };
}

export function formatQaUploadCleanupMetricsPrometheus() {
  const d = metrics.duration_ms;
  const nsLines = [...metrics.by_namespace.entries()]
    .map(([ns, v]) => `qa_upload_cleanup_actions_total{namespace="${ns}"} ${v}`)
    .join('\n');
  const reasonLines = [...metrics.by_reason.entries()]
    .map(([reason, v]) => `qa_upload_cleanup_by_reason_total{reason="${reason}"} ${v}`)
    .join('\n');

  return [
    '# HELP qa_upload_cleanup_runs_total Cleanup job executions',
    '# TYPE qa_upload_cleanup_runs_total counter',
    `qa_upload_cleanup_runs_total ${metrics.runs_total}`,
    '# HELP qa_upload_cleanup_candidates_total Files evaluated as orphan candidates',
    '# TYPE qa_upload_cleanup_candidates_total counter',
    `qa_upload_cleanup_candidates_total ${metrics.candidates_total}`,
    '# HELP qa_upload_cleanup_quarantined_total Files moved to quarantine',
    '# TYPE qa_upload_cleanup_quarantined_total counter',
    `qa_upload_cleanup_quarantined_total ${metrics.quarantined_total}`,
    '# HELP qa_upload_cleanup_deleted_total Files permanently deleted',
    '# TYPE qa_upload_cleanup_deleted_total counter',
    `qa_upload_cleanup_deleted_total ${metrics.deleted_total}`,
    '# HELP qa_upload_cleanup_skipped_referenced_total Skipped because still referenced',
    '# TYPE qa_upload_cleanup_skipped_referenced_total counter',
    `qa_upload_cleanup_skipped_referenced_total ${metrics.skipped_referenced_total}`,
    '# HELP qa_upload_cleanup_skipped_young_total Skipped because within TTL',
    '# TYPE qa_upload_cleanup_skipped_young_total counter',
    `qa_upload_cleanup_skipped_young_total ${metrics.skipped_young_total}`,
    '# HELP qa_upload_cleanup_duration_ms Cleanup duration summary',
    '# TYPE qa_upload_cleanup_duration_ms summary',
    `qa_upload_cleanup_duration_ms_count ${d.count}`,
    `qa_upload_cleanup_duration_ms_sum ${d.sum}`,
    nsLines,
    reasonLines,
  ]
    .filter(Boolean)
    .join('\n');
}

export function resetQaUploadCleanupMetricsForTests() {
  metrics.runs_total = 0;
  metrics.candidates_total = 0;
  metrics.quarantined_total = 0;
  metrics.deleted_total = 0;
  metrics.skipped_referenced_total = 0;
  metrics.skipped_young_total = 0;
  metrics.skipped_error_total = 0;
  metrics.purge_deleted_total = 0;
  metrics.duration_ms = { count: 0, sum: 0, min: null, max: 0, last: null };
  metrics.by_namespace.clear();
  metrics.by_reason.clear();
}
