/**
 * Start or resume a student test attempt (Phase 2A).
 *
 * Validation order:
 * 1. Authenticated student (controller)
 * 2. Valid testId (controller)
 * 3. Test exists
 * 4. Test published & not deleted
 * 5. Student authorized (assertStudentOwnsTest)
 * 6. Test within availability window (G-RT-03)
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
  assertCanCreateNewTestAttempt,
} from './testRetakePolicy.service.js';
import {
  recordAttemptCreation,
} from '../observability/studentRuntimeMetrics.service.js';
import {
  emitStudentRuntimeAudit,
  STUDENT_RUNTIME_AUDIT_EVENTS,
} from '../observability/studentRuntimeObservability.service.js';
import {
  initializeAttemptDeliveryLayout,
  isShuffleEnabled,
} from './attemptDeliveryLayout.service.js';
import {
  assertTestAvailabilityWindow,
  AVAILABILITY_PHASE,
  fetchUtcNowMs,
  getAvailabilityNowMs,
  toAvailabilityIso,
} from './testAvailabilityWindow.service.js';
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
 * @deprecated Use toAvailabilityIso from testAvailabilityWindow.service.js
 * @param {unknown} value
 * @returns {string|null}
 */
function toIsoDateTime(value) {
  return toAvailabilityIso(value);
}

/** @deprecated Use assertTestAvailabilityWindow from testAvailabilityWindow.service.js */
export function assertTestWithinAvailabilityWindow(testRow, now = new Date()) {
  assertTestAvailabilityWindow(testRow, {
    phase: AVAILABILITY_PHASE.CREATE_ATTEMPT,
    nowMs: now.getTime(),
    context: 'studentTestStart.assertTestWithinAvailabilityWindow',
  });
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

  const previewNowMs = await getAvailabilityNowMs(mysqlPool);
  assertTestAvailabilityWindow(previewRow, {
    phase: AVAILABILITY_PHASE.ANY_ACCESS,
    nowMs: previewNowMs,
    context: 'studentTestStart.preview',
  });

  const connection = await mysqlPool.getConnection();

  try {
    await connection.beginTransaction();

    const nowMs = await fetchUtcNowMs(connection);

    const [[testRow]] = await connection.query(LOCK_TEST_BY_ID_SQL, [testId]);
    validateTestExistsAndPublished(testRow);
    assertTestAvailabilityWindow(testRow, {
      phase: AVAILABILITY_PHASE.ANY_ACCESS,
      nowMs,
      context: 'studentTestStart.lock',
    });

    const [activeRows] = await connection.query(LOCK_ACTIVE_ATTEMPT_SQL, [
      testId,
      studentId,
      studentId,
    ]);
    const activeAttempt = activeRows[0];

    if (activeAttempt) {
      const expiredNow = await expireAttemptIfExpired({
        attemptId: activeAttempt.id,
        nowMs,
        executor: connection,
      });

      if (!expiredNow) {
        assertTestAvailabilityWindow(testRow, {
          phase: AVAILABILITY_PHASE.IN_PROGRESS,
          nowMs,
          attemptStartedAt: activeAttempt.started_at,
          context: 'studentTestStart.resume',
        });

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
        recordAttemptCreation({ stack: 'portal', resumed: true });
        emitStudentRuntimeAudit({
          event: STUDENT_RUNTIME_AUDIT_EVENTS.ATTEMPT_CREATED,
          stack: 'portal',
          operation: 'portalStart',
          outcome: 'success',
          userId: studentId,
          attemptId: result.attemptId,
          testId,
          metadata: { resumed: true },
        });
        return result;
      }
    }

    assertTestAvailabilityWindow(testRow, {
      phase: AVAILABILITY_PHASE.CREATE_ATTEMPT,
      nowMs,
      context: 'studentTestStart.create',
    });

    const [[countRow]] = await connection.query(COUNT_STUDENT_TEST_ATTEMPTS_SQL, [
      testId,
      studentId,
      studentId,
    ]);
    const totalAttempts = Number(countRow?.total ?? 0);

    assertCanCreateNewTestAttempt(
      testRow,
      { totalAttempts, hasActiveAttempt: false },
      { testId, context: 'studentTestStart.create' }
    );

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
      studentId,
      studentId,
      testId,
    ]);

    const attemptId = Number(insertResult?.insertId);
    if (!Number.isInteger(attemptId) || attemptId <= 0) {
      throw new ApiError(403, 'Cannot start a new attempt for this test.', {
        code: 'ATTEMPT_CREATE_DENIED',
        testId,
      });
    }

    await initializeAttemptDeliveryLayout({
      attemptId,
      testId,
      shuffleQuestions: isShuffleEnabled(testRow.shuffle_questions),
      shuffleOptions: isShuffleEnabled(testRow.shuffle_options),
      attemptNonce: null,
      connection,
    });

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

    recordAttemptCreation({ stack: 'portal', resumed: false });
    emitStudentRuntimeAudit({
      event: STUDENT_RUNTIME_AUDIT_EVENTS.ATTEMPT_CREATED,
      stack: 'portal',
      operation: 'portalStart',
      outcome: 'success',
      userId: studentId,
      attemptId,
      testId,
      metadata: { resumed: false, attemptNumber },
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
