import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import { sendSuccess } from '../utils/httpEnvelope.js';
import {
  getExportHistoryBatch,
  getImportHistoryBatch,
  getTransferDashboard,
  listExportHistory,
  listImportHistory,
  listTransferActivityLogs,
} from '../services/testTransferHistory.service.js';

function parseLimitOffset(query) {
  const limit = Math.min(Math.max(Number(query.limit ?? 50), 1), 200);
  const offset = Math.max(Number(query.offset ?? 0), 0);
  return { limit, offset };
}

/** GET /tests/transfer/dashboard */
export const getTestTransferDashboard = asyncHandler(async (req, res) => {
  const data = await getTransferDashboard();
  sendSuccess(res, data);
});

/** GET /tests/transfer/export-history */
export const getTestExportHistory = asyncHandler(async (req, res) => {
  const { limit, offset } = parseLimitOffset(req.query);
  const testId = req.query.test_id != null ? Number(req.query.test_id) : null;
  const status = req.query.status ? String(req.query.status) : null;

  const rows = await listExportHistory({
    limit,
    offset,
    testId: Number.isFinite(testId) ? testId : null,
    status,
  });

  sendSuccess(res, { items: rows, limit, offset });
});

/** GET /tests/transfer/export-history/:batchId */
export const getTestExportHistoryBatch = asyncHandler(async (req, res) => {
  const batchId = Number(req.params.batchId);
  if (!Number.isInteger(batchId) || batchId <= 0) {
    throw new ApiError(400, 'Invalid export batch id', { code: 'INVALID_BATCH_ID' });
  }

  const batch = await getExportHistoryBatch(batchId);
  if (!batch) {
    throw new ApiError(404, 'Export batch not found', { code: 'EXPORT_BATCH_NOT_FOUND' });
  }

  sendSuccess(res, batch);
});

/** GET /tests/transfer/import-history */
export const getTestImportHistory = asyncHandler(async (req, res) => {
  const { limit, offset } = parseLimitOffset(req.query);
  const courseId = req.query.course_id != null ? Number(req.query.course_id) : null;
  const status = req.query.status ? String(req.query.status) : null;

  const rows = await listImportHistory({
    limit,
    offset,
    courseId: Number.isFinite(courseId) ? courseId : null,
    status,
  });

  sendSuccess(res, { items: rows, limit, offset });
});

/** GET /tests/transfer/import-history/:batchId */
export const getTestImportHistoryBatch = asyncHandler(async (req, res) => {
  const batchId = Number(req.params.batchId);
  if (!Number.isInteger(batchId) || batchId <= 0) {
    throw new ApiError(400, 'Invalid import batch id', { code: 'INVALID_BATCH_ID' });
  }

  const batch = await getImportHistoryBatch(batchId);
  if (!batch) {
    throw new ApiError(404, 'Import batch not found', { code: 'IMPORT_BATCH_NOT_FOUND' });
  }

  sendSuccess(res, batch);
});

/** GET /tests/transfer/logs */
export const getTestTransferLogs = asyncHandler(async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit ?? 100), 1), 500);
  const logs = await listTransferActivityLogs({ limit });
  sendSuccess(res, { items: logs, limit });
});
