import { mysqlPool } from '../config/mysql.js';
import { AppError } from '../errors/base/AppError.js';
import { NOT_FOUND, VALIDATION_ERROR } from '../errors/codes/ErrorCodes.js';
import { assertTestMutationAccess } from './testMutationAccess.service.js';
import { isPublishedDbStatus } from './testCompleteness.service.js';
import { logActivity } from './activityLog.service.js';

/**
 * @param {number} testId
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} [executor]
 */
async function loadTestReleaseRow(testId, executor = mysqlPool) {
  const [rows] = await executor.query(
    `SELECT id, status, results_released_at
     FROM tests
     WHERE id = ? AND deleted_at IS NULL
     LIMIT 1`,
    [Number(testId)]
  );
  return rows[0] ?? null;
}

/**
 * @param {Record<string, unknown>|null} row
 */
function mapReleaseRow(row) {
  if (!row) return null;
  return {
    testId: Number(row.id),
    results_released_at: row.results_released_at
      ? new Date(row.results_released_at).toISOString()
      : null,
  };
}

/**
 * @param {number} testId
 * @param {{ userId?: number|null, role?: string|null }} access
 */
export async function releaseTestResults(testId, access = {}) {
  const tid = Number(testId);
  await assertTestMutationAccess(tid, access.userId, access.role ?? 'admin', {
    action: 'release_results',
  });

  const row = await loadTestReleaseRow(tid);
  if (!row) {
    throw new AppError({
      message: 'Test was not found.',
      errorCode: NOT_FOUND,
      httpStatus: 404,
      isOperational: true,
      metadata: { testId: tid },
    });
  }

  if (!isPublishedDbStatus(row.status)) {
    throw new AppError({
      message: 'Only published tests can release results to students.',
      errorCode: VALIDATION_ERROR,
      httpStatus: 422,
      isOperational: true,
      metadata: { testId: tid, status: row.status },
    });
  }

  await mysqlPool.query(
    `UPDATE tests SET results_released_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [tid]
  );

  const updated = await loadTestReleaseRow(tid);
  const payload = mapReleaseRow(updated);

  await logActivity({
    userId: access.userId ?? null,
    role: access.role ?? 'admin',
    action: 'admin.test.results_released',
    entityType: 'test',
    entityId: String(tid),
    metadata: { testId: tid, results_released_at: payload?.results_released_at ?? null },
  });

  return payload;
}

/**
 * @param {number} testId
 * @param {{ userId?: number|null, role?: string|null }} access
 */
export async function unreleaseTestResults(testId, access = {}) {
  const tid = Number(testId);
  await assertTestMutationAccess(tid, access.userId, access.role ?? 'admin', {
    action: 'unrelease_results',
  });

  const row = await loadTestReleaseRow(tid);
  if (!row) {
    throw new AppError({
      message: 'Test was not found.',
      errorCode: NOT_FOUND,
      httpStatus: 404,
      isOperational: true,
      metadata: { testId: tid },
    });
  }

  await mysqlPool.query(
    `UPDATE tests SET results_released_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [tid]
  );

  const updated = await loadTestReleaseRow(tid);
  const payload = mapReleaseRow(updated);

  await logActivity({
    userId: access.userId ?? null,
    role: access.role ?? 'admin',
    action: 'admin.test.results_unreleased',
    entityType: 'test',
    entityId: String(tid),
    metadata: { testId: tid },
  });

  return payload;
}
