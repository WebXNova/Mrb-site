/**
 * Q&A audit logging metrics (Prometheus-compatible).
 */

const metrics = {
  success_total: 0,
  failure_total: 0,
  retry_total: 0,
  dlq_total: 0,
  dlq_failure_total: 0,
  alert_total: 0,
  /** @type {Map<string, number>} */
  by_action: new Map(),
  /** @type {Map<string, number>} */
  by_category: new Map(),
  /** @type {Map<string, number>} */
  failures_by_action: new Map(),
};

/** @type {number[]} */
let failureTimestamps = [];

/**
 * @param {string} action
 * @param {string} category
 */
export function recordQaAuditSuccess(action, category) {
  metrics.success_total += 1;
  metrics.by_action.set(action, (metrics.by_action.get(action) ?? 0) + 1);
  metrics.by_category.set(category, (metrics.by_category.get(category) ?? 0) + 1);
}

/**
 * @param {string} action
 */
export function recordQaAuditRetry(action) {
  metrics.retry_total += 1;
  metrics.by_action.set(`${action}:retry`, (metrics.by_action.get(`${action}:retry`) ?? 0) + 1);
}

/**
 * @param {string} action
 * @param {string} category
 */
export function recordQaAuditFailure(action, category) {
  metrics.failure_total += 1;
  metrics.failures_by_action.set(action, (metrics.failures_by_action.get(action) ?? 0) + 1);
  metrics.by_category.set(`${category}:failed`, (metrics.by_category.get(`${category}:failed`) ?? 0) + 1);
  failureTimestamps.push(Date.now());
}

export function recordQaAuditDlq() {
  metrics.dlq_total += 1;
}

export function recordQaAuditDlqFailure() {
  metrics.dlq_failure_total += 1;
}

export function recordQaAuditAlert() {
  metrics.alert_total += 1;
}

/**
 * @param {number} windowMs
 * @param {number} threshold
 */
export function shouldEmitQaAuditAlert(windowMs, threshold) {
  const cutoff = Date.now() - windowMs;
  failureTimestamps = failureTimestamps.filter((ts) => ts >= cutoff);
  return failureTimestamps.length >= threshold;
}

export function getQaAuditMetricsSnapshot() {
  return {
    success_total: metrics.success_total,
    failure_total: metrics.failure_total,
    retry_total: metrics.retry_total,
    dlq_total: metrics.dlq_total,
    dlq_failure_total: metrics.dlq_failure_total,
    alert_total: metrics.alert_total,
    by_action: Object.fromEntries(metrics.by_action.entries()),
    by_category: Object.fromEntries(metrics.by_category.entries()),
    failures_by_action: Object.fromEntries(metrics.failures_by_action.entries()),
    recent_failure_count: failureTimestamps.length,
  };
}

export function formatQaAuditMetricsPrometheus() {
  const actionLines = [...metrics.by_action.entries()]
    .map(([action, v]) => `qa_audit_log_events_total{action="${action}"} ${v}`)
    .join('\n');
  const categoryLines = [...metrics.by_category.entries()]
    .map(([category, v]) => `qa_audit_log_by_category_total{category="${category}"} ${v}`)
    .join('\n');
  const failureActionLines = [...metrics.failures_by_action.entries()]
    .map(([action, v]) => `qa_audit_log_failures_total{action="${action}"} ${v}`)
    .join('\n');

  return [
    '# HELP qa_audit_log_success_total Q&A audit events persisted successfully',
    '# TYPE qa_audit_log_success_total counter',
    `qa_audit_log_success_total ${metrics.success_total}`,
    '# HELP qa_audit_log_failure_total Q&A audit persist failures after retries',
    '# TYPE qa_audit_log_failure_total counter',
    `qa_audit_log_failure_total ${metrics.failure_total}`,
    '# HELP qa_audit_log_retry_total Q&A audit persist retry attempts',
    '# TYPE qa_audit_log_retry_total counter',
    `qa_audit_log_retry_total ${metrics.retry_total}`,
    '# HELP qa_audit_log_dlq_total Events written to Q&A audit dead-letter queue',
    '# TYPE qa_audit_log_dlq_total counter',
    `qa_audit_log_dlq_total ${metrics.dlq_total}`,
    '# HELP qa_audit_log_dlq_failure_total Dead-letter writes that also failed',
    '# TYPE qa_audit_log_dlq_failure_total counter',
    `qa_audit_log_dlq_failure_total ${metrics.dlq_failure_total}`,
    '# HELP qa_audit_log_alert_total Q&A audit operational alerts emitted',
    '# TYPE qa_audit_log_alert_total counter',
    `qa_audit_log_alert_total ${metrics.alert_total}`,
    actionLines,
    categoryLines,
    failureActionLines,
  ]
    .filter(Boolean)
    .join('\n');
}

export function resetQaAuditMetricsForTests() {
  metrics.success_total = 0;
  metrics.failure_total = 0;
  metrics.retry_total = 0;
  metrics.dlq_total = 0;
  metrics.dlq_failure_total = 0;
  metrics.alert_total = 0;
  metrics.by_action.clear();
  metrics.by_category.clear();
  metrics.failures_by_action.clear();
  failureTimestamps = [];
}
