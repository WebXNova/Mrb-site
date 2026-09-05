import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import { mysqlPool } from '../config/mysql.js';
import { assertTestMutationAccess } from '../services/testMutationAccess.service.js';
import {
  getCompletedAttemptCount,
  getExportFilename,
  buildXlsxBuffer,
} from '../services/testResultExport.service.js';
import {
  ensureExportLogsSchema,
  insertExportLog,
  updateExportLogStatus,
  generateExportId,
} from '../db/ensureExportLogsSchema.js';

/**
 * Sync in-memory XLSX builds the full workbook in heap. Cap attempts so an admin
 * export cannot OOM the shared student API process (PM2 max_memory_restart).
 */
export const MAX_SYNC_XLSX_EXPORT_ATTEMPTS = 1500;

let exportInFlight = false;

function nowDbString() {
  return new Date().toISOString().replace('T', ' ').replace(/\..+$/, '') + '.000000';
}

async function createAuditLog(userId, testId, exportId, startedAt) {
  try {
    await ensureExportLogsSchema(mysqlPool);
    await insertExportLog(mysqlPool, {
      export_id: exportId,
      user_id: userId,
      test_id: testId,
      format: 'xlsx',
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

  const testRow = await assertTestMutationAccess(testId, userId, role, {
    action: 'export_results',
  });
  const testTitle = testRow?.title || 'export';

  const completedCount = await getCompletedAttemptCount(testId);
  if (completedCount === 0) {
    return res.status(204).json({ message: 'No completed attempts to export.' });
  }

  if (completedCount > MAX_SYNC_XLSX_EXPORT_ATTEMPTS) {
    throw new ApiError(
      413,
      `This export is too large for a live download (${completedCount} attempts). Use a filtered CSV export or contact support.`,
      {
        code: 'EXPORT_TOO_LARGE',
        completedCount,
        maxAttempts: MAX_SYNC_XLSX_EXPORT_ATTEMPTS,
      }
    );
  }

  if (exportInFlight) {
    throw new ApiError(429, 'Another results export is already running. Try again shortly.', {
      code: 'EXPORT_BUSY',
    });
  }

  const exportId = generateExportId();
  const startedAt = nowDbString();
  await createAuditLog(userId, testId, exportId, startedAt);

  const filename = getExportFilename(testTitle, 'xlsx');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  exportInFlight = true;
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
  } finally {
    exportInFlight = false;
  }
});
