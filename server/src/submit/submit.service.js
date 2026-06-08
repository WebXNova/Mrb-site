/**
 * Submit Test Module — lock engine (active → submitted).
 *
 * Attempt ownership, expiry, and token validation are delegated to attemptGuard.
 *
 * Transaction strategy:
 * 1. BEGIN
 * 2. SELECT … FOR UPDATE — serializes concurrent submit requests for the same attempt
 * 3. validateSubmission — fail if not active / already submitted / expired
 * 4. lockAttempt — conditional UPDATE (in_progress → submitted); 0 rows = race loser
 * 5. gradeAttempt — grading engine entry point (idempotent via uq_attempt_result)
 * 6. LINK result_id on attempt row
 * 7. COMMIT — rollback on any failure restores in_progress state
 */

import { mysqlPool } from '../config/mysql.js';
import {
  AttemptExpiredStateError,
  AttemptInvalidStateError,
  AttemptNotFoundError,
} from '../errors/testAttempt/TestAttemptErrors.js';
import { ATTEMPT_DB_STATUS } from '../attempt/attempt.constants.js';
import { gradeAttempt } from '../grading/gradeAttempt.js';
import { StructuredLogger } from '../utils/requestId.js';
import { AttemptAlreadySubmittedError } from './submit.errors.js';
import {
  LINK_ATTEMPT_RESULT_SQL,
  LOCK_ATTEMPT_FOR_UPDATE_SQL,
  LOCK_ATTEMPT_SUBMIT_SQL,
} from './submit.queries.js';

const logger = new StructuredLogger({ service: 'submitTest' });

/**
 * @typedef {object} AttemptSessionContext
 * @property {number} id
 * @property {number} testId
 * @property {number} studentId
 * @property {string} status
 */

/**
 * @typedef {object} ValidatedSubmission
 * @property {number} attemptId
 * @property {number} studentId
 * @property {number} testId
 */

/**
 * Re-validates attempt state under row lock (post attemptGuard).
 *
 * @param {import('mysql2/promise').PoolConnection} connection
 * @param {AttemptSessionContext} attemptSession
 * @returns {Promise<ValidatedSubmission>}
 */
export async function validateSubmission(connection, attemptSession) {
  const attemptId = Number(attemptSession.id);
  const studentId = Number(attemptSession.studentId);

  const [rows] = await connection.query(LOCK_ATTEMPT_FOR_UPDATE_SQL, [attemptId]);
  const row = rows[0];
  if (!row) {
    throw new AttemptNotFoundError({ attemptId, studentId, reason: 'attempt_not_found' });
  }

  const ownerStudentId = Number(row.student_id);
  if (ownerStudentId !== studentId) {
    throw new AttemptNotFoundError({ attemptId, studentId, reason: 'ownership_mismatch' });
  }

  const status = String(row.status);

  if (status === ATTEMPT_DB_STATUS.SUBMITTED) {
    throw new AttemptAlreadySubmittedError({ attemptId, studentId });
  }

  if (status === ATTEMPT_DB_STATUS.EXPIRED) {
    throw new AttemptExpiredStateError({ attemptId, studentId });
  }

  if (status !== ATTEMPT_DB_STATUS.ACTIVE) {
    throw new AttemptInvalidStateError({
      attemptId,
      status,
      reason: 'attempt_not_active',
    });
  }

  if (row.expires_at == null) {
    throw new AttemptInvalidStateError({ attemptId, reason: 'missing_expires_at' });
  }

  const [[expiryProbe]] = await connection.query(
    `SELECT CASE WHEN ? < NOW() THEN 1 ELSE 0 END AS is_past_expiry`,
    [row.expires_at]
  );
  if (Number(expiryProbe?.is_past_expiry) === 1) {
    await connection.query(
      `UPDATE test_attempts
       SET status = 'expired', completion_reason = 'expired', updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status = 'in_progress'`,
      [attemptId]
    );
    throw new AttemptExpiredStateError({ attemptId, studentId });
  }

  return {
    attemptId,
    studentId,
    testId: Number(row.test_id),
  };
}

/**
 * Permanently locks attempt (in_progress → submitted).
 *
 * @param {import('mysql2/promise').PoolConnection} connection
 * @param {number} attemptId
 * @param {number} studentId
 */
export async function lockAttempt(connection, attemptId, studentId) {
  const [result] = await connection.query(LOCK_ATTEMPT_SUBMIT_SQL, [attemptId, studentId]);
  const affected = Number(result?.affectedRows ?? 0);

  if (affected !== 1) {
    const [statusRows] = await connection.query(
      `SELECT status FROM test_attempts WHERE id = ? LIMIT 1`,
      [attemptId]
    );
    const currentStatus = String(statusRows[0]?.status ?? '');

    if (currentStatus === ATTEMPT_DB_STATUS.SUBMITTED) {
      throw new AttemptAlreadySubmittedError({ attemptId, studentId });
    }
    if (currentStatus === ATTEMPT_DB_STATUS.EXPIRED) {
      throw new AttemptExpiredStateError({ attemptId, studentId });
    }

    throw new AttemptInvalidStateError({
      attemptId,
      status: currentStatus,
      reason: 'lock_transition_failed',
    });
  }

  logger.info('attempt locked for submission', {
    event: 'ATTEMPT_LOCKED',
    attemptId,
    studentId,
  });
}

/**
 * Full submission pipeline — transaction-safe, idempotent against duplicate grading.
 *
 * @param {AttemptSessionContext} attemptSession
 */
export async function submitAttempt(attemptSession) {
  const connection = await mysqlPool.getConnection();

  try {
    await connection.beginTransaction();

    const validated = await validateSubmission(connection, attemptSession);
    await lockAttempt(connection, validated.attemptId, validated.studentId);

    const { resultId } = await gradeAttempt(validated.attemptId, connection);

    await connection.query(LINK_ATTEMPT_RESULT_SQL, [
      resultId,
      validated.attemptId,
      validated.studentId,
    ]);

    await connection.commit();

    logger.info('test submitted successfully', {
      event: 'TEST_SUBMITTED',
      attemptId: validated.attemptId,
      studentId: validated.studentId,
      resultId,
    });

    return { attemptId: validated.attemptId, resultId };
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rollbackError) {
      logger.error('submit rollback failed', {
        attemptId: attemptSession.id,
        message: rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
      });
    }
    throw error;
  } finally {
    connection.release();
  }
}
