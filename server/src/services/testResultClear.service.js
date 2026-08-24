import { mysqlPool } from '../config/mysql.js';
import { AppError } from '../errors/base/AppError.js';
import { NOT_FOUND } from '../errors/codes/ErrorCodes.js';
import { assertTestMutationAccess } from './testMutationAccess.service.js';

/**
 * Deletes all attempts for a test; cascades to test_results, student_answers,
 * and test_cheating_violations via FK constraints.
 *
 * @param {number} testId
 * @param {{ userId?: number|null, role?: string|null }} [access]
 */
export async function clearTestResultData(testId, access = {}) {
  const tid = Number(testId);
  await assertTestMutationAccess(tid, access.userId, access.role ?? 'admin', {
    action: 'clear_results',
  });

  const [testRows] = await mysqlPool.query(
    `SELECT id FROM tests WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
    [tid]
  );
  if (!testRows[0]) {
    throw new AppError({
      message: 'Test was not found.',
      errorCode: NOT_FOUND,
      httpStatus: 404,
      isOperational: true,
      metadata: { testId: tid },
    });
  }

  const [deleteResult] = await mysqlPool.query(`DELETE FROM test_attempts WHERE test_id = ?`, [tid]);

  return {
    testId: tid,
    deletedAttempts: Number(deleteResult.affectedRows ?? 0),
  };
}
