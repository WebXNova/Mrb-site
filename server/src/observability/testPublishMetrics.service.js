/**
 * G-09 — in-process publish metrics (Prometheus-compatible export).
 *
 * Counters:
 *   publish_success_total
 *   publish_failure_total
 *
 * Duration summary:
 *   publish_duration_ms (count, sum, min, max, last)
 */

/** @typedef {'first' | 'replay'} PublishSuccessKind */

const metrics = {
  publish_success_total: 0,
  publish_failure_total: 0,
  publish_duration_ms: {
    count: 0,
    sum: 0,
    min: null,
    max: 0,
    last: null,
  },
  success_by_kind: {
    first: 0,
    replay: 0,
  },
  /** @type {Map<string, number>} */
  failures_by_code: new Map(),
};

/**
 * @param {number} durationMs
 */
function recordDuration(durationMs) {
  const ms = Math.max(0, Number(durationMs) || 0);
  const bucket = metrics.publish_duration_ms;
  bucket.count += 1;
  bucket.sum += ms;
  bucket.last = ms;
  bucket.min = bucket.min == null ? ms : Math.min(bucket.min, ms);
  bucket.max = Math.max(bucket.max, ms);
}

/**
 * @param {{
 *   durationMs: number,
 *   replay?: boolean,
 *   questionCount?: number|null,
 * }} params
 */
export function recordPublishSuccess({ durationMs, replay = false }) {
  metrics.publish_success_total += 1;
  metrics.success_by_kind[replay ? 'replay' : 'first'] += 1;
  recordDuration(durationMs);
}

/**
 * @param {{
 *   durationMs: number,
 *   errorCode?: string|null,
 * }} params
 */
export function recordPublishFailure({ durationMs, errorCode = null }) {
  metrics.publish_failure_total += 1;
  recordDuration(durationMs);
  const code = String(errorCode || 'UNKNOWN').trim() || 'UNKNOWN';
  metrics.failures_by_code.set(code, (metrics.failures_by_code.get(code) ?? 0) + 1);
}

/**
 * @returns {Record<string, unknown>}
 */
export function getPublishMetricsSnapshot() {
  return {
    publish_success_total: metrics.publish_success_total,
    publish_failure_total: metrics.publish_failure_total,
    publish_duration_ms: { ...metrics.publish_duration_ms },
    success_by_kind: { ...metrics.success_by_kind },
    failures_by_code: Object.fromEntries(metrics.failures_by_code.entries()),
  };
}

/**
 * Prometheus text exposition format (subset).
 * @returns {string}
 */
export function formatPublishMetricsPrometheus() {
  const d = metrics.publish_duration_ms;
  const failureLines = [...metrics.failures_by_code.entries()]
    .map(([code, total]) => `publish_failure_total{error_code="${code}"} ${total}`)
    .join('\n');

  return [
    '# HELP publish_success_total Total successful test publish operations.',
    '# TYPE publish_success_total counter',
    `publish_success_total ${metrics.publish_success_total}`,
    '# HELP publish_failure_total Total failed test publish operations.',
    '# TYPE publish_failure_total counter',
    `publish_failure_total ${metrics.publish_failure_total}`,
    failureLines,
    '# HELP publish_duration_ms_count Publish operations included in duration summary.',
    '# TYPE publish_duration_ms_count counter',
    `publish_duration_ms_count ${d.count}`,
    '# HELP publish_duration_ms_sum Cumulative publish duration in milliseconds.',
    '# TYPE publish_duration_ms_sum counter',
    `publish_duration_ms_sum ${d.sum}`,
    '# HELP publish_duration_ms_last Most recent publish duration in milliseconds.',
    '# TYPE publish_duration_ms_last gauge',
    `publish_duration_ms_last ${d.last ?? 0}`,
    '# HELP publish_duration_ms_min Minimum observed publish duration in milliseconds.',
    '# TYPE publish_duration_ms_min gauge',
    `publish_duration_ms_min ${d.min ?? 0}`,
    '# HELP publish_duration_ms_max Maximum observed publish duration in milliseconds.',
    '# TYPE publish_duration_ms_max gauge',
    `publish_duration_ms_max ${d.max ?? 0}`,
    '# HELP publish_success_first_total Successful first-time publishes.',
    '# TYPE publish_success_first_total counter',
    `publish_success_first_total ${metrics.success_by_kind.first}`,
    '# HELP publish_success_replay_total Successful idempotent publish replays.',
    '# TYPE publish_success_replay_total counter',
    `publish_success_replay_total ${metrics.success_by_kind.replay}`,
  ]
    .filter(Boolean)
    .join('\n');
}

/** Test-only reset — not for production hot paths. */
export function resetPublishMetricsForTests() {
  metrics.publish_success_total = 0;
  metrics.publish_failure_total = 0;
  metrics.publish_duration_ms = { count: 0, sum: 0, min: null, max: 0, last: null };
  metrics.success_by_kind.first = 0;
  metrics.success_by_kind.replay = 0;
  metrics.failures_by_code.clear();
}
