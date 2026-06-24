import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import { mysqlPool } from '../config/mysql.js';
import { assertTestMutationAccess } from '../services/testMutationAccess.service.js';
import {
  getCompletedAttemptCount,
  getExportFilename,
  streamCsvToResponse,
  buildXlsxBuffer,
} from '../services/testResultExport.service.js';
import {
  ensureExportLogsSchema,
  insertExportLog,
  updateExportLogStatus,
  generateExportId,
} from '../db/ensureExportLogsSchema.js';

function parseFormat(query) {
  const fmt = String(query?.format ?? 'xlsx').trim().toLowerCase();
  if (fmt !== 'xlsx' && fmt !== 'csv') {
    throw new ApiError(400, 'Export format must be "xlsx" or "csv".');
  }
  return fmt;
}

function nowDbString() {
  return new Date().toISOString().replace('T', ' ').replace(/\..+$/, '') + '.000000';
}

async function createAuditLog(userId, testId, format, exportId, startedAt) {
  try {
    await ensureExportLogsSchema(mysqlPool);
    await insertExportLog(mysqlPool, {
      export_id: exportId,
      user_id: userId,
      test_id: testId,
      format,
      total_rows_exported: 0,
      started_at: startedAt,
      completed_at: null,
      status: 'started',
      error_message: null,
    });
  } catch {
    // non-blocking
  }
}

async function completeAuditLog(exportId, totalRows, completedAt) {
  try {
    await updateExportLogStatus(mysqlPool, exportId, {
      status: 'completed',
      completed_at: completedAt,
      total_rows_exported: totalRows,
    });
  } catch {
    // non-blocking
  }
}

async function failAuditLog(exportId, errorMessage) {
  try {
    await updateExportLogStatus(mysqlPool, exportId, {
      status: 'failed',
      completed_at: nowDbString(),
      error_message: String(errorMessage).slice(0, 1000),
    });
  } catch {
    // non-blocking
  }
}

export const getTestResultsExport = asyncHandler(async (req, res) => {
  const testId = Number(req.params.testId);
  if (!Number.isInteger(testId) || testId <= 0) {
    throw new ApiError(400, 'Invalid test ID.');
  }

  const userId = req.user?.id ?? null;
  const role = req.user?.role ?? 'admin';
  const format = parseFormat(req.query);

  const testRow = await assertTestMutationAccess(testId, userId, role, {
    action: 'export_results',
  });
  const testTitle = testRow?.title || 'export';

  const completedCount = await getCompletedAttemptCount(testId);
  if (completedCount === 0) {
    return res.status(204).json({ message: 'No completed attempts to export.' });
  }

  const exportId = generateExportId();
  const startedAt = nowDbString();
  await createAuditLog(userId, testId, format, exportId, startedAt);

  if (format === 'csv') {
    const filename = getExportFilename(testTitle, 'csv');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    try {
      const totalRows = await streamCsvToResponse(res, testId);
      res.end();
      await completeAuditLog(exportId, totalRows, nowDbString());
    } catch (error) {
      await failAuditLog(exportId, error instanceof Error ? error.message : String(error));
      if (!res.writableEnded) {
        res.end();
      }
    }
    return;
  }

  const filename = getExportFilename(testTitle, 'xlsx');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  try {
    const result = await buildXlsxBuffer(testId);
    if (!result) {
      await failAuditLog(exportId, 'No data to export');
      return res.status(204).json({ message: 'No completed attempts to export.' });
    }
    res.send(result.buffer);
    await completeAuditLog(exportId, result.totalRows, nowDbString());
  } catch (error) {
    await failAuditLog(exportId, error instanceof Error ? error.message : String(error));
    throw error;
  }
});
