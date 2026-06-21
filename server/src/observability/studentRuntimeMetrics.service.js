/**
 * Student runtime metrics — Prometheus-compatible in-process counters (runtime hardening).
 *
 * Counters:
 *   student_runtime_success_total{stack,operation}
 *   student_runtime_failure_total{stack,operation,error_code}
 *   attempt_creation_total{stack,resumed}
 *   attempt_submission_total{stack}
 *
 * Duration summary:
 *   runtime_duration_ms{stack,operation}
 */

/** @typedef {'slug' | 'portal' | 'legacy' | 'unknown'} RuntimeStack */

const metrics = {
  student_runtime_success_total: 0,
  student_runtime_failure_total: 0,
  attempt_creation_total: 0,
  attempt_submission_total: 0,
  runtime_duration_ms: {
    count: 0,
    sum: 0,
    min: null,
    max: 0,
    last: null,
  },
  /** @type {Map<string, number>} */
  success_by_key: new Map(),
  /** @type {Map<string, number>} */
  failure_by_key: new Map(),
  /** @type {Map<string, number>} */
  creation_by_key: new Map(),
  /** @type {Map<string, number>} */
  submission_by_key: new Map(),
  /** @type {Map<string, number>} */
  duration_by_key: new Map(),
};

function labelKey(parts) {
  return Object.entries(parts)
    .map(([k, v]) => `${k}=${String(v ?? 'unknown')}`)
    .sort()
    .join(',');
}

/**
 * @param {number} durationMs
 * @param {Record<string, string>} labels
 */
function recordDuration(durationMs, labels) {
  const ms = Math.max(0, Number(durationMs) || 0);
  const bucket = metrics.runtime_duration_ms;
  bucket.count += 1;
  bucket.sum += ms;
  bucket.last = ms;
  bucket.min = bucket.min == null ? ms : Math.min(bucket.min, ms);
  bucket.max = Math.max(bucket.max, ms);

  const key = labelKey(labels);
  metrics.duration_by_key.set(key, (metrics.duration_by_key.get(key) ?? 0) + ms);
}

/**
 * @param {{
 *   stack?: RuntimeStack,
 *   operation: string,
 *   durationMs: number,
 * }} params
 */
export function recordStudentRuntimeSuccess({ stack = 'unknown', operation, durationMs }) {
  metrics.student_runtime_success_total += 1;
  const key = labelKey({ stack, operation });
  metrics.success_by_key.set(key, (metrics.success_by_key.get(key) ?? 0) + 1);
  recordDuration(durationMs, { stack, operation });
}

/**
 * @param {{
 *   stack?: RuntimeStack,
 *   operation: string,
 *   durationMs: number,
 *   errorCode?: string|null,
 * }} params
 */
export function recordStudentRuntimeFailure({
  stack = 'unknown',
  operation,
  durationMs,
  errorCode = null,
}) {
  metrics.student_runtime_failure_total += 1;
  const code = String(errorCode || 'UNKNOWN').trim() || 'UNKNOWN';
  const key = labelKey({ stack, operation, error_code: code });
  metrics.failure_by_key.set(key, (metrics.failure_by_key.get(key) ?? 0) + 1);
  recordDuration(durationMs, { stack, operation });
}

/**
 * @param {{ stack?: RuntimeStack, resumed?: boolean }} params
 */
export function recordAttemptCreation({ stack = 'unknown', resumed = false }) {
  metrics.attempt_creation_total += 1;
  const key = labelKey({ stack, resumed: resumed ? 'true' : 'false' });
  metrics.creation_by_key.set(key, (metrics.creation_by_key.get(key) ?? 0) + 1);
}

/**
 * @param {{ stack?: RuntimeStack }} params
 */
export function recordAttemptSubmission({ stack = 'unknown' }) {
  metrics.attempt_submission_total += 1;
  const key = labelKey({ stack });
  metrics.submission_by_key.set(key, (metrics.submission_by_key.get(key) ?? 0) + 1);
}

/**
 * @returns {Record<string, unknown>}
 */
export function getStudentRuntimeMetricsSnapshot() {
  return {
    student_runtime_success_total: metrics.student_runtime_success_total,
    student_runtime_failure_total: metrics.student_runtime_failure_total,
    attempt_creation_total: metrics.attempt_creation_total,
    attempt_submission_total: metrics.attempt_submission_total,
    runtime_duration_ms: { ...metrics.runtime_duration_ms },
    success_by_key: Object.fromEntries(metrics.success_by_key.entries()),
    failure_by_key: Object.fromEntries(metrics.failure_by_key.entries()),
    creation_by_key: Object.fromEntries(metrics.creation_by_key.entries()),
    submission_by_key: Object.fromEntries(metrics.submission_by_key.entries()),
  };
}

function formatLabeledCounter(name, map) {
  const lines = [...map.entries()].map(([labels, total]) => {
    const labelStr = labels
      .split(',')
      .map((pair) => {
        const [k, v] = pair.split('=');
        return `${k}="${v}"`;
      })
      .join(',');
    return `${name}{${labelStr}} ${total}`;
  });
  if (!lines.length) {
    return `${name} 0`;
  }
  return lines.join('\n');
}

/**
 * @returns {string}
 */
export function formatStudentRuntimeMetricsPrometheus() {
  const d = metrics.runtime_duration_ms;
  return [
    '# HELP student_runtime_success_total Successful student runtime HTTP operations.',
    '# TYPE student_runtime_success_total counter',
    formatLabeledCounter('student_runtime_success_total', metrics.success_by_key),
    '# HELP student_runtime_failure_total Failed student runtime HTTP operations.',
    '# TYPE student_runtime_failure_total counter',
    formatLabeledCounter('student_runtime_failure_total', metrics.failure_by_key),
    '# HELP attempt_creation_total Test attempt rows created or resumed via runtime.',
    '# TYPE attempt_creation_total counter',
    formatLabeledCounter('attempt_creation_total', metrics.creation_by_key),
    '# HELP attempt_submission_total Test attempts submitted via runtime.',
    '# TYPE attempt_submission_total counter',
    formatLabeledCounter('attempt_submission_total', metrics.submission_by_key),
    '# HELP runtime_duration_ms_count Student runtime operations in duration summary.',
    '# TYPE runtime_duration_ms_count counter',
    `runtime_duration_ms_count ${d.count}`,
    '# HELP runtime_duration_ms_sum Cumulative student runtime duration in milliseconds.',
    '# TYPE runtime_duration_ms_sum counter',
    `runtime_duration_ms_sum ${d.sum}`,
    '# HELP runtime_duration_ms_last Most recent student runtime duration in milliseconds.',
    '# TYPE runtime_duration_ms_last gauge',
    `runtime_duration_ms_last ${d.last ?? 0}`,
    '# HELP runtime_duration_ms_min Minimum observed student runtime duration.',
    '# TYPE runtime_duration_ms_min gauge',
    `runtime_duration_ms_min ${d.min ?? 0}`,
    '# HELP runtime_duration_ms_max Maximum observed student runtime duration.',
    '# TYPE runtime_duration_ms_max gauge',
    `runtime_duration_ms_max ${d.max ?? 0}`,
  ].join('\n');
}

/** Test-only reset */
export function resetStudentRuntimeMetricsForTests() {
  metrics.student_runtime_success_total = 0;
  metrics.student_runtime_failure_total = 0;
  metrics.attempt_creation_total = 0;
  metrics.attempt_submission_total = 0;
  metrics.runtime_duration_ms = { count: 0, sum: 0, min: null, max: 0, last: null };
  metrics.success_by_key.clear();
  metrics.failure_by_key.clear();
  metrics.creation_by_key.clear();
  metrics.submission_by_key.clear();
  metrics.duration_by_key.clear();
}
