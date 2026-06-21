import { asyncHandler } from '../utils/asyncHandler.js';
import {
  formatPublishMetricsPrometheus,
  getPublishMetricsSnapshot,
} from '../observability/testPublishMetrics.service.js';
import {
  formatStudentRuntimeMetricsPrometheus,
  getStudentRuntimeMetricsSnapshot,
} from '../observability/studentRuntimeMetrics.service.js';
import {
  formatIdempotencyCleanupMetricsPrometheus,
  getIdempotencyCleanupMetricsSnapshot,
} from '../observability/idempotencyCleanupMetrics.service.js';
import {
  formatActivityLogRetentionMetricsPrometheus,
  getActivityLogRetentionMetricsSnapshot,
} from '../observability/activityLogRetentionMetrics.service.js';
import {
  formatQaUploadCleanupMetricsPrometheus,
  getQaUploadCleanupMetricsSnapshot,
} from '../observability/qaUploadCleanupMetrics.service.js';
import {
  formatProcessedWebhooksRetentionMetricsPrometheus,
  getProcessedWebhooksRetentionMetricsSnapshot,
} from '../observability/processedWebhooksRetentionMetrics.service.js';
import {
  formatQaAuditMetricsPrometheus,
  getQaAuditMetricsSnapshot,
} from '../observability/qaAuditMetrics.service.js';

export const getMetrics = asyncHandler(async (req, res) => {
  const accept = String(req.headers.accept ?? '');
  if (accept.includes('text/plain') || accept.includes('application/openmetrics-text')) {
    res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    const body = [
      formatPublishMetricsPrometheus(),
      formatStudentRuntimeMetricsPrometheus(),
      formatQaUploadCleanupMetricsPrometheus(),
      formatActivityLogRetentionMetricsPrometheus(),
      formatIdempotencyCleanupMetricsPrometheus(),
      formatProcessedWebhooksRetentionMetricsPrometheus(),
      formatQaAuditMetricsPrometheus(),
    ]
      .filter(Boolean)
      .join('\n');
    res.status(200).send(body);
    return;
  }

  res.status(200).json({
    success: true,
    data: {
      publish: getPublishMetricsSnapshot(),
      studentRuntime: getStudentRuntimeMetricsSnapshot(),
      qaUploadCleanup: getQaUploadCleanupMetricsSnapshot(),
      activityLogRetention: getActivityLogRetentionMetricsSnapshot(),
      idempotencyCleanup: getIdempotencyCleanupMetricsSnapshot(),
      processedWebhooksRetention: getProcessedWebhooksRetentionMetricsSnapshot(),
      qaAudit: getQaAuditMetricsSnapshot(),
    },
    requestId: req.requestId ?? null,
  });
});
