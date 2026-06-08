/**
 * Start or resume a student test attempt (Phase 2A).
 *
 * Validation order:
 * 1. Authenticated student (controller)
 * 2. Valid testId (controller)
 * 3. Test exists
 * 4. Test published & not deleted
 * 5. Student authorized (assertStudentOwnsTest)
 * 6. Test within availability window
 * 7. Attempts remaining
 * 8. Resume active attempt if present
 */

import { mysqlPool } from '../config/mysql.js';
import { ApiError } from '../utils/apiError.js';
import { StructuredLogger } from '../utils/requestId.js';
import {
  assertValidTestDurationMinutes,
  logAttemptTimeCalculation,
} from './attemptTiming.service.js';
import { assertStudentIdForAttemptInsert } from './testAttempt.service.js';
import { STUDENT_ELIGIBLE_TEST_STATUS } from '../constants/studentEligibleTest.constants.js';
import { assertStudentOwnsTest } from './testOwnership.service.js';
import { expireAttemptIfExpired } from './attemptExpiry.service.js';
import {
  TestNotAccessibleError,
  TestNotFoundError,
} from '../errors/testAttempt/TestAttemptErrors.js';
import {
  LOAD_TEST_BY_ID_SQL,
  LOCK_TEST_BY_ID_SQL,
  LOCK_ACTIVE_ATTEMPT_SQL,
  COUNT_STUDENT_TEST_ATTEMPTS_SQL,
  NEXT_ATTEMPT_NUMBER_SQL,
  INSERT_TEST_ATTEMPT_SQL,
} from './studentTestStart.queries.js';

const logger = new StructuredLogger({ service: 'studentTestStart' });

/**
 * @param {unknown} value
 * @returns {string|null}
 */
function toIsoDateTime(value) {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * @param {Record<string, unknown>} testRow
 * @param {Date} [now]
 */
export function assertTestWithinAvailabilityWindow(testRow, now = new Date()) {
  const startRaw = testRow.start_date;
  const endRaw = testRow.end_date;

  if (startRaw) {
    const start = new Date(startRaw);
    if (!Number.isNaN(start.getTime()) && now < start) {
      throw new TestNotAccessibleError({
        testId: testRow.id,
        reason: 'test_not_yet_available',
        startDate: toIsoDateTime(start),
      });
    }
  }

  if (endRaw) {
    const end = new Date(endRaw);
    if (!Number.isNaN(end.getTime()) && now > end) {
      throw new TestNotAccessibleError({
        testId: testRow.id,
        reason: 'test_no_longer_available',
        endDate: toIsoDateTime(end),
      });
    }
  }
}

/**
 * @param {Record<string, unknown>|null|undefined} row
 */
export function validateTestExistsAndPublished(row) {
  if (!row) {
    throw new TestNotFoundError({ reason: 'test_not_found' });
  }

  if (row.deleted_at != null) {
    throw new TestNotFoundError({ testId: row.id, reason: 'test_deleted' });
  }

  if (String(row.status) !== STUDENT_ELIGIBLE_TEST_STATUS) {
    throw new TestNotAccessibleError({
      testId: row.id,
      reason: 'test_not_published',
      status: row.status,
    });
  }
}

/**
 * @param {number} maxAttempts
 * @param {number} attemptsUsed
 * @param {number} testId
 */
export function assertAttemptsRemaining(maxAttempts, attemptsUsed, testId) {
  const max = Number(maxAttempts ?? 1);
  const used = Math.max(0, Number(attemptsUsed ?? 0));

  if (max > 0 && used >= max) {
    throw new ApiError(403, 'Maximum attempts reached for this test', {
      code: 'MAX_ATTEMPTS_REACHED',
      testId,
      attemptsUsed: used,
      maxAttempts: max,
    });
  }
}

/**
 * @typedef {object} StartStudentTestResult
 * @property {number} attemptId
 * @property {boolean} isResume
 * @property {string|null} startedAt
 * @property {string|null} expiresAt
 */

/**
 * Start a new attempt or resume an in-progress attempt.
 *
 * @param {{
 *   studentId: number,
 *   testId: number,
 *   ipAddress?: string|null,
 *   userAgent?: string|null,
 * }} input
 * @returns {Promise<StartStudentTestResult>}
 */
export async function startOrResumeStudentTest(input) {
  const studentId = Number(input.studentId);
  const testId = Number(input.testId);
  const ipAddress = input.ipAddress ?? null;
  const userAgent = input.userAgent ?? null;

  logger.info('student test start requested', { studentId, testId });

  const [[previewRow]] = await mysqlPool.query(LOAD_TEST_BY_ID_SQL, [testId]);
  validateTestExistsAndPublished(previewRow);
  await assertStudentOwnsTest(studentId, testId);
  assertTestWithinAvailabilityWindow(previewRow);

  const connection = await mysqlPool.getConnection();

  try {
    await connection.beginTransaction();

    const [[testRow]] = await connection.query(LOCK_TEST_BY_ID_SQL, [testId]);
    validateTestExistsAndPublished(testRow);
    assertTestWithinAvailabilityWindow(testRow);

    const [activeRows] = await connection.query(LOCK_ACTIVE_ATTEMPT_SQL, [
      testId,
      studentId,
      studentId,
    ]);
    const activeAttempt = activeRows[0];

    if (activeAttempt) {
      const nowMs = Date.now();
      const expiredNow = await expireAttemptIfExpired({
        attemptId: activeAttempt.id,
        nowMs,
        executor: connection,
      });

      // If the attempt expired between the initial active attempt query and now,
      // treat it as non-resumable and create a new attempt.
      if (!expiredNow) {
        await connection.commit();
        const result = {
          attemptId: Number(activeAttempt.id),
          isResume: true,
          startedAt: toIsoDateTime(activeAttempt.started_at),
          expiresAt: toIsoDateTime(activeAttempt.expires_at),
        };
        logger.info('student test start resumed active attempt', {
          studentId,
          testId,
          attemptId: result.attemptId,
        });
        return result;
      }
    }

    const [[countRow]] = await connection.query(COUNT_STUDENT_TEST_ATTEMPTS_SQL, [
      testId,
      studentId,
      studentId,
    ]);
    const attemptsUsed = Number(countRow?.total ?? 0);
    const maxAttempts = Number(testRow.max_attempts ?? 1);
    assertAttemptsRemaining(maxAttempts, attemptsUsed, testId);

    const [[nextRow]] = await connection.query(NEXT_ATTEMPT_NUMBER_SQL, [testId, studentId]);
    const attemptNumber = Number(nextRow?.next_attempt ?? 1);

    const durationMinutes = assertValidTestDurationMinutes(testRow.duration_minutes, {
      testId,
      context: 'studentTestStart.startOrResumeStudentTest',
    });

    logAttemptTimeCalculation(logger, {
      testId,
      studentId,
      durationMinutes,
    });

    assertStudentIdForAttemptInsert(studentId);

    const [insertResult] = await connection.query(INSERT_TEST_ATTEMPT_SQL, [
      testId,
      studentId,
      studentId,
      attemptNumber,
      durationMinutes,
      ipAddress,
      userAgent,
    ]);

    const attemptId = Number(insertResult?.insertId);
    if (!Number.isInteger(attemptId) || attemptId <= 0) {
      throw new ApiError(500, 'Failed to create test attempt', { code: 'ATTEMPT_CREATE_FAILED' });
    }

    await connection.commit();

    const [[timingRow]] = await connection.query(
      `SELECT started_at, expires_at FROM test_attempts WHERE id = ? LIMIT 1`,
      [attemptId]
    );

    const result = {
      attemptId,
      isResume: false,
      startedAt: toIsoDateTime(timingRow?.started_at),
      expiresAt: toIsoDateTime(timingRow?.expires_at),
    };

    logger.info('student test start created attempt', {
      studentId,
      testId,
      attemptId,
      attemptNumber,
    });

    return result;
  } catch (error) {
    await connection.rollback();

    if (error?.code === 'ER_DUP_ENTRY') {
      logger.warn('student test start duplicate attempt race', { studentId, testId });
      throw new ApiError(409, 'Could not start test attempt due to a concurrent request', {
        code: 'ATTEMPT_START_CONFLICT',
      });
    }

    throw error;
  } finally {
    connection.release();
  }
}
