import { mysqlPool } from '../config/mysql.js';
import { AppError } from '../errors/base/AppError.js';
import { FORBIDDEN, NOT_FOUND } from '../errors/codes/ErrorCodes.js';
import { QuizDraftOwnershipError } from '../errors/testQuizDraft.errors.js';
import { findTestQuizDraftByTestIdForRead } from '../repositories/testQuizDraft.repository.js';
import { isAdminRole } from '../utils/isAdminRole.js';
import { isQuestionBankStaffRole } from '../utils/isQuestionBankStaffRole.js';

/**
 * @typedef {'read' | 'write' | 'delete'} QuizDraftAccessAction
 */

/**
 * @param {number} testId
 */
async function loadTestAccessRow(testId) {
  const [rows] = await mysqlPool.query(
    `SELECT id, created_by, status
     FROM tests
     WHERE id = ? AND deleted_at IS NULL
     LIMIT 1`,
    [testId]
  );
  return rows[0] ?? null;
}

/**
 * @param {number} userId
 * @param {string} role
 */
function assertStaffPermission(userId, role) {
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new AppError({
      message: 'Authentication required.',
      errorCode: 'UNAUTHORIZED',
      httpStatus: 401,
      isOperational: true,
    });
  }

  if (!isQuestionBankStaffRole(role)) {
    throw new AppError({
      message: 'Quiz draft access requires admin or teacher permissions.',
      errorCode: FORBIDDEN,
      httpStatus: 403,
      isOperational: true,
      metadata: { role },
    });
  }
}

/**
 * @param {{
 *   userId: number,
 *   role: string,
 *   testCreatedBy: number,
 *   draftCreatedBy: number | null,
 *   action: QuizDraftAccessAction,
 *   testId: number,
 *   draftId?: number | null,
 * }} params
 */
function assertOwnership({ userId, role, testCreatedBy, draftCreatedBy, action, testId, draftId = null }) {
  if (isAdminRole(role)) {
    return;
  }

  const ownsTest = Number(testCreatedBy) === Number(userId);
  const ownsDraft = draftCreatedBy != null && Number(draftCreatedBy) === Number(userId);

  if (action === 'read') {
    if (!ownsTest && !ownsDraft) {
      throw new QuizDraftOwnershipError(testId, {
        draftId,
        createdBy: draftCreatedBy ?? testCreatedBy,
        userId,
      });
    }
    return;
  }

  if (!ownsTest && !ownsDraft) {
    throw new QuizDraftOwnershipError(testId, {
      draftId,
      createdBy: draftCreatedBy ?? testCreatedBy,
      userId,
    });
  }
}

/**
 * Verify test exists, caller has staff permissions, and ownership rules pass.
 *
 * @param {number} testId
 * @param {number} userId
 * @param {string} role
 * @param {QuizDraftAccessAction} action
 */
export async function assertQuizDraftAccess(testId, userId, role, action) {
  assertStaffPermission(userId, role);

  const testRow = await loadTestAccessRow(testId);
  if (!testRow) {
    throw new AppError({
      message: 'Test was not found.',
      errorCode: NOT_FOUND,
      httpStatus: 404,
      isOperational: true,
      metadata: { testId: Number(testId) },
    });
  }

  const draft = await findTestQuizDraftByTestIdForRead(mysqlPool, testId);

  assertOwnership({
    userId,
    role,
    testCreatedBy: Number(testRow.created_by),
    draftCreatedBy: draft?.createdBy ?? null,
    action,
    testId,
    draftId: draft?.draftId ?? null,
  });

  return { test: testRow, draft };
}
