/**
 * Published test edit authority — allows in-place edits while keeping status published.
 *
 * Versioning is not implemented yet; existing attempts remain linked to question rows
 * they answered. Superseded question_bank rows are soft-deleted when rematerialized.
 */

import { mysqlPool } from '../config/mysql.js';
import { AppError } from '../errors/base/AppError.js';
import { NOT_FOUND, TEST_IS_LOCKED, VALIDATION_ERROR } from '../errors/codes/ErrorCodes.js';
import { isPublishedDbStatus } from './testCompleteness.service.js';
import { loadTestLockRow } from './publishedTestLock.service.js';
import { logActivity } from './activityLog.service.js';
import { logSecurityEvent, TEST_SECURITY_ACTIONS } from './testSecurityAudit.service.js';

export const PUBLISHED_EDIT_CONTROL_KEYS = Object.freeze([
  'confirm_published_edit',
  'expected_updated_at',
]);

/**
 * @param {unknown} body
 */
export function extractPublishedEditControls(body) {
  if (body == null || typeof body !== 'object' || Array.isArray(body)) {
    return {
      confirmPublishedEdit: false,
      expectedUpdatedAt: null,
      payload: body,
    };
  }

  const record = /** @type {Record<string, unknown>} */ (body);
  const confirmPublishedEdit = record.confirm_published_edit === true;
  const expectedUpdatedAt =
    record.expected_updated_at == null || record.expected_updated_at === ''
      ? null
      : String(record.expected_updated_at);

  const payload = { ...record };
  for (const key of PUBLISHED_EDIT_CONTROL_KEYS) {
    delete payload[key];
  }

  return { confirmPublishedEdit, expectedUpdatedAt, payload };
}

/**
 * @param {number} testId
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} [executor]
 */
export async function countTestAttempts(testId, executor = mysqlPool) {
  const tid = Number(testId);
  const [rows] = await executor.query(
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) AS in_progress,
       SUM(CASE WHEN status IN ('submitted', 'graded', 'completed') THEN 1 ELSE 0 END) AS completed
     FROM test_attempts
     WHERE test_id = ?`,
    [tid]
  );
  const row = rows[0] ?? {};
  return {
    total: Number(row.total ?? 0),
    inProgress: Number(row.in_progress ?? 0),
    completed: Number(row.completed ?? 0),
  };
}

/**
 * @param {Record<string, unknown>|null|undefined} testRow
 */
export function isPublishedTestRow(testRow) {
  return Boolean(testRow && isPublishedDbStatus(testRow.status));
}

/**
 * @param {number} testId
 * @param {{ confirmPublishedEdit?: boolean, expectedUpdatedAt?: string|null }} controls
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} [executor]
 */
export async function resolvePublishedEditContext(testId, controls = {}, executor = mysqlPool) {
  const row = await loadTestLockRow(testId, executor);
  if (!row) {
    throw new AppError({
      message: 'Test was not found.',
      errorCode: NOT_FOUND,
      httpStatus: 404,
      isOperational: true,
      metadata: { testId: Number(testId) },
    });
  }

  if (!isPublishedDbStatus(row.status)) {
    return {
      isPublished: false,
      testRow: row,
      attemptStats: null,
      requiresConfirmation: false,
    };
  }

  const attemptStats = await countTestAttempts(testId, executor);
  const requiresConfirmation = attemptStats.total > 0;

  if (requiresConfirmation && !controls.confirmPublishedEdit) {
    logSecurityEvent({
      action: TEST_SECURITY_ACTIONS.PUBLISHED_TEST_EDIT_ATTEMPT,
      testId: Number(testId),
      outcome: 'denied',
      reason: 'PUBLISHED_EDIT_CONFIRMATION_REQUIRED',
      errorCode: TEST_IS_LOCKED,
      metadata: { attemptStats },
    });

    throw new AppError({
      message:
        'This published test has student attempts. Set confirm_published_edit to true to apply changes.',
      errorCode: 'PUBLISHED_EDIT_CONFIRMATION_REQUIRED',
      httpStatus: 409,
      isOperational: true,
      metadata: {
        testId: Number(testId),
        attemptStats,
        requiresConfirmation: true,
      },
    });
  }

  if (controls.expectedUpdatedAt) {
    const [timeRows] = await executor.query(
      `SELECT updated_at FROM tests WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
      [Number(testId)]
    );
    const dbUpdatedAt = timeRows[0]?.updated_at;
    const dbIso = dbUpdatedAt instanceof Date ? dbUpdatedAt.toISOString() : String(dbUpdatedAt ?? '');
    const expectedIso = new Date(controls.expectedUpdatedAt).toISOString();

    if (dbIso && expectedIso && dbIso !== expectedIso) {
      throw new AppError({
        message: 'This test was modified by someone else. Reload and try again.',
        errorCode: 'TEST_UPDATE_CONFLICT',
        httpStatus: 409,
        isOperational: true,
        metadata: {
          testId: Number(testId),
          expectedUpdatedAt: expectedIso,
          currentUpdatedAt: dbIso,
        },
      });
    }
  }

  return {
    isPublished: true,
    testRow: row,
    attemptStats,
    requiresConfirmation,
  };
}

/**
 * @param {{
 *   testId: number,
 *   userId: number|null,
 *   role?: string,
 *   section: string,
 *   metadata?: Record<string, unknown>,
 * }} input
 */
export async function auditPublishedTestEdit({ testId, userId, role = 'admin', section, metadata = {} }) {
  await logActivity({
    userId,
    role,
    action: 'admin.test.published_edit',
    entityType: 'test',
    entityId: String(testId),
    metadata: {
      testId: Number(testId),
      section,
      ...metadata,
    },
  });

  logSecurityEvent({
    action: TEST_SECURITY_ACTIONS.PUBLISHED_TEST_EDIT,
    testId: Number(testId),
    userId,
    outcome: 'allowed',
    reason: `PUBLISHED_TEST_EDIT_${section.toUpperCase()}`,
    metadata: { section, ...metadata },
  });
}

/**
 * @param {Record<string, unknown>|null} attemptStats
 */
export function buildPublishedEditMetadata(attemptStats) {
  if (!attemptStats || attemptStats.total === 0) {
    return { publishedEditWarning: null };
  }

  return {
    publishedEditWarning: {
      message: 'This test has existing student attempts. Changes apply to future attempts immediately.',
      attemptStats,
    },
  };
}
