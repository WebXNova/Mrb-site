/**
 * Test transfer history — export/import audit, dashboard stats, activity logs.
 */

import { mysqlPool } from '../config/mysql.js';
import { listRecentActivityLogs } from './activityLog.service.js';
import {
  createTestExportBatch,
  getTestExportBatchById,
  getTestImportBatchById,
  getTestTransferDashboardStats,
  listTestExportBatches,
  listTestImportBatches,
  patchTestImportBatchMetrics,
} from '../repositories/testTransferHistory.repository.js';

export { TEST_EXPORT_BATCH_STATUS } from '../repositories/testTransferHistory.repository.js';

/**
 * Persist export audit row (non-blocking on failure).
 */
export async function recordExportAudit(params) {
  try {
    if (!Number.isInteger(params.exportedBy) || params.exportedBy <= 0) return null;
    return await createTestExportBatch(mysqlPool, params);
  } catch (error) {
    console.warn('[test-transfer] export audit write failed', error?.message || error);
    return null;
  }
}

/**
 * Update import batch monitoring fields (non-blocking on failure).
 */
export async function recordImportBatchMetrics(batchId, patch) {
  try {
    if (batchId == null) return;
    await patchTestImportBatchMetrics(mysqlPool, batchId, patch);
  } catch (error) {
    console.warn('[test-transfer] import metrics write failed', error?.message || error);
  }
}

const TRANSFER_LOG_ACTIONS = [
  'admin.test.export',
  'admin.test.export.rich_content',
  'admin.test.import',
];

function mapExportBatchRow(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    exported_by: Number(row.exported_by),
    exported_by_name: row.exported_by_name ?? null,
    test_id: Number(row.test_id),
    test_title: row.test_title ?? null,
    course_id: Number(row.course_id),
    course_title: row.course_title ?? null,
    format: row.format,
    file_name: row.file_name ?? null,
    question_count: Number(row.question_count ?? 0),
    image_count: Number(row.image_count ?? 0),
    status: row.status,
    error_code: row.error_code ?? null,
    error_message: row.error_message ?? null,
    processing_time_ms: row.processing_time_ms != null ? Number(row.processing_time_ms) : null,
    created_at: row.created_at,
  };
}

function mapImportBatchRow(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    uploaded_by: Number(row.uploaded_by),
    uploaded_by_name: row.uploaded_by_name ?? null,
    source_type: row.source_type,
    format: row.format ?? null,
    file_name: row.file_name ?? null,
    target_course_id: Number(row.target_course_id),
    course_title: row.course_title ?? null,
    target_test_id: row.target_test_id != null ? Number(row.target_test_id) : null,
    test_title: row.test_title ?? null,
    total_questions: Number(row.total_questions ?? 0),
    image_count: Number(row.image_count ?? 0),
    validation_error_count: Number(row.validation_error_count ?? 0),
    status: row.status,
    error_code: row.error_code ?? null,
    error_message: row.error_message ?? null,
    processing_time_ms: row.processing_time_ms != null ? Number(row.processing_time_ms) : null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function getTransferDashboard() {
  let stats = {
    export_count: 0,
    import_count: 0,
    export_failures: 0,
    import_failures: 0,
    failure_count: 0,
    last_activity_at: null,
    last_export_at: null,
    last_import_at: null,
  };

  try {
    stats = await getTestTransferDashboardStats(mysqlPool);
  } catch (error) {
    console.warn('[test-transfer] dashboard stats unavailable', error?.message || error);
  }

  const recentExports = await listTestExportBatchesSafe({ limit: 5 });
  const recentImports = await listTestImportBatchesSafe({ limit: 5 });

  return {
    stats,
    recent_exports: recentExports,
    recent_imports: recentImports,
  };
}

async function listTestExportBatchesSafe(opts) {
  try {
    const rows = await listTestExportBatches(mysqlPool, opts);
    return rows.map(mapExportBatchRow);
  } catch {
    return [];
  }
}

async function listTestImportBatchesSafe(opts) {
  try {
    const rows = await listTestImportBatches(mysqlPool, opts);
    return rows.map(mapImportBatchRow);
  } catch {
    return [];
  }
}

export async function listExportHistory(opts = {}) {
  const rows = await listTestExportBatches(mysqlPool, opts);
  return rows.map(mapExportBatchRow);
}

export async function getExportHistoryBatch(batchId) {
  const row = await getTestExportBatchById(mysqlPool, Number(batchId));
  return mapExportBatchRow(row);
}

export async function listImportHistory(opts = {}) {
  const rows = await listTestImportBatches(mysqlPool, opts);
  return rows.map(mapImportBatchRow);
}

export async function getImportHistoryBatch(batchId) {
  const row = await getTestImportBatchById(mysqlPool, Number(batchId));
  return mapImportBatchRow(row);
}

/**
 * Filtered activity logs for test export/import operations.
 *
 * @param {{ limit?: number }} [opts]
 */
export async function listTransferActivityLogs(opts = {}) {
  const limit = Math.min(Math.max(Number(opts.limit ?? 100), 1), 500);
  const logs = await listRecentActivityLogs(limit * 3);
  return logs
    .filter((log) => TRANSFER_LOG_ACTIONS.includes(String(log.action ?? '')))
    .slice(0, limit)
    .map((log) => ({
      id: log.id,
      action: log.action,
      entity_type: log.entityType ?? log.entity_type ?? null,
      entity_id: log.entityId ?? log.entity_id ?? null,
      role: log.role ?? null,
      user_id: log.userId ?? log.user_id ?? null,
      metadata: log.metadata ?? null,
      created_at: log.createdAt ?? log.created_at ?? null,
    }));
}
