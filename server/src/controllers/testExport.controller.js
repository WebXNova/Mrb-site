import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import { sendSuccess } from '../utils/httpEnvelope.js';
import { logActivity } from '../services/activityLog.service.js';
import {
  logTestExportCompleted,
  logTestExportFailed,
  logTestExportStarted,
} from '../observability/lmsActionLogger.service.js';
import { exportTest } from '../services/testExport.service.js';
import { TEST_EXPORT_FORMATS } from '../constants/testRichContent.constants.js';
import { parsePositiveTestIdParam } from '../validators/testRules.schema.js';
import {
  recordExportAudit,
  TEST_EXPORT_BATCH_STATUS,
} from '../services/testTransferHistory.service.js';

/**
 * Shared export handler — GET (legacy) and POST (preferred).
 */
async function handleTestExport(req, res, formatOverride = null) {
  const testId = parsePositiveTestIdParam(req.params);
  const userId = req.user?.id ?? null;
  const role = req.user?.role ?? 'admin';
  const format =
    formatOverride ??
    String(req.query.format ?? req.body?.format ?? TEST_EXPORT_FORMATS.CSV).trim().toLowerCase();

  logTestExportStarted({ testId, userId, role, format });

  const startedAt = Date.now();

  try {
    const exported = await exportTest(testId, format, { userId, role });
    const processingTimeMs = Date.now() - startedAt;

    const exportBatchId = await recordExportAudit({
      exportedBy: userId,
      testId,
      courseId: exported.course_id,
      format: exported.format,
      fileName: exported.file_name,
      questionCount: exported.question_count,
      imageCount: exported.image_count ?? exported.inlined_image_count ?? 0,
      status: TEST_EXPORT_BATCH_STATUS.COMPLETED,
      processingTimeMs,
    });

    logTestExportCompleted({
      testId,
      userId,
      role,
      format: exported.format,
      version: exported.version,
      questionCount: exported.question_count,
      courseId: exported.course_id,
      batchId: exportBatchId,
      processingTimeMs,
    });

    await logActivity({
      userId,
      role,
      action: 'admin.test.export',
      entityType: 'test',
      entityId: String(testId),
      metadata: {
        format: exported.format,
        version: exported.version,
        questionCount: exported.question_count,
        fileName: exported.file_name,
        batchId: exportBatchId,
        processingTimeMs,
        inlinedImageCount: exported.inlined_image_count ?? 0,
      },
    });

    res.setHeader('Content-Type', exported.mime_type);
    res.setHeader('Content-Disposition', `attachment; filename="${exported.file_name}"`);
    res.setHeader('X-Export-Question-Count', String(exported.question_count));
    res.setHeader('X-Export-Format', exported.format);
    if (exportBatchId != null) {
      res.setHeader('X-Export-Batch-Id', String(exportBatchId));
    }
    res.send(exported.buffer);
  } catch (error) {
    logTestExportFailed({
      testId,
      userId,
      role,
      format,
      code: error?.code ?? null,
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * GET /tests/:testId/export?format=csv
 * Downloads full test definition with rich HTML content.
 */
export const getTestExport = asyncHandler(async (req, res) => {
  await handleTestExport(req, res);
});

/**
 * POST /tests/:testId/export — preferred CSV export (cookie auth, no Bearer).
 * Body: { format?: "csv" }
 */
export const postTestExport = asyncHandler(async (req, res) => {
  await handleTestExport(req, res, TEST_EXPORT_FORMATS.CSV);
});

/**
 * GET /tests/:testId/export/rich — JSON envelope for API clients (backward compatible).
 */
export const getRichContentTestExport = asyncHandler(async (req, res) => {
  const testId = parsePositiveTestIdParam(req.params);
  const userId = req.user?.id ?? null;
  const role = req.user?.role ?? 'admin';

  logTestExportStarted({ testId, userId, role, format: TEST_EXPORT_FORMATS.JSON });

  const startedAt = Date.now();

  try {
    const exported = await exportTest(testId, TEST_EXPORT_FORMATS.JSON, { userId, role });
    const processingTimeMs = Date.now() - startedAt;

    const exportBatchId = await recordExportAudit({
      exportedBy: userId,
      testId,
      courseId: exported.course_id,
      format: exported.format,
      fileName: exported.file_name,
      questionCount: exported.question_count,
      imageCount: exported.image_count ?? 0,
      status: TEST_EXPORT_BATCH_STATUS.COMPLETED,
      processingTimeMs,
    });

    logTestExportCompleted({
      testId,
      userId,
      role,
      format: exported.format,
      version: exported.version,
      questionCount: exported.question_count,
      courseId: exported.course_id,
      batchId: exportBatchId,
      processingTimeMs,
    });

    await logActivity({
      userId,
      role,
      action: 'admin.test.export.rich_content',
      entityType: 'test',
      entityId: String(testId),
      metadata: {
        questionCount: exported.question_count,
        format: exported.format,
        version: exported.version,
        batchId: exportBatchId,
        processingTimeMs,
      },
    });

    sendSuccess(res, {
      test_id: exported.test_id,
      course_id: exported.course_id,
      question_count: exported.question_count,
      file_name: exported.file_name,
      content: exported.content,
      export_batch_id: exportBatchId,
      processing_time_ms: processingTimeMs,
    });
  } catch (error) {
    logTestExportFailed({
      testId,
      userId,
      role,
      format: TEST_EXPORT_FORMATS.JSON,
      code: error?.code ?? null,
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
});

/**
 * @param {string} format
 */
export function parseExportFormatQuery(format) {
  const normalized = String(format ?? '').trim().toLowerCase();
  if (!normalized || normalized === TEST_EXPORT_FORMATS.JSON) {
    return TEST_EXPORT_FORMATS.JSON;
  }
  if (normalized === TEST_EXPORT_FORMATS.CSV) {
    return TEST_EXPORT_FORMATS.CSV;
  }
  if (normalized === TEST_EXPORT_FORMATS.ZIP) {
    return TEST_EXPORT_FORMATS.ZIP;
  }
  throw new ApiError(422, 'Export format must be "json", "csv", or "zip".', {
    code: 'INVALID_EXPORT_FORMAT',
  });
}
