/**
 * Load student test attempt page data (Phase 2B).
 *
 * Authorization order:
 * 1. Authenticated student (controller)
 * 2. Valid attemptId (controller)
 * 3. Attempt exists
 * 4–5. Student owns attempt (identity + enrollment)
 * 6. Attempt loadable (in_progress, not expired, published test)
 */

import { mysqlPool } from '../config/mysql.js';
import { StructuredLogger } from '../utils/requestId.js';
import { STUDENT_ELIGIBLE_TEST_STATUS } from '../constants/studentEligibleTest.constants.js';
import { studentOwnsAttempt } from './attemptOwnership.service.js';
import { loadComposedTestQuestions } from './testQuestionComposition.service.js';
import {
  AttemptNotFoundError,
  AttemptNotOwnedError,
  TestNotAccessibleError,
} from '../errors/testAttempt/TestAttemptErrors.js';
import { toStudentAttemptLoadResponse } from '../dto/studentAttemptLoad.dto.js';
import {
  LOAD_ATTEMPT_WITH_TEST_SQL,
  LOAD_SAVED_ANSWERS_SQL,
} from './studentAttemptLoad.queries.js';

import { assertAttemptActive } from './attemptTimerGuard.service.js';

const logger = new StructuredLogger({ service: 'studentAttemptLoad' });

/**
 * @param {Record<string, unknown>|null|undefined} row
 * @param {number} [nowMs]
 */
export async function assertAttemptLoadable(row, nowMs = Date.now(), options = {}) {
  if (!row) {
    throw new AttemptNotFoundError({ reason: 'attempt_not_found' });
  }

  if (row.test_deleted_at != null) {
    throw new TestNotAccessibleError({
      attemptId: row.id,
      testId: row.test_id,
      reason: 'test_deleted',
    });
  }

  if (String(row.test_status) !== STUDENT_ELIGIBLE_TEST_STATUS) {
    throw new TestNotAccessibleError({
      attemptId: row.id,
      testId: row.test_id,
      reason: 'test_not_published',
    });
  }

  await assertAttemptActive({
    attemptId: row.id,
    attemptRow: { status: row.status, expires_at: row.expires_at },
    nowMs,
    executor: options.executor,
    markExpired: options.markExpired,
  });
}

/**
 * @param {Record<string, unknown>|null|undefined} row
 * @param {number} studentId
 */
export function assertAttemptBelongsToStudent(row, studentId) {
  if (!row) {
    throw new AttemptNotFoundError({ reason: 'attempt_not_found' });
  }

  const uid = Number(studentId);
  const ownerUserId = row.user_id == null ? null : Number(row.user_id);
  const ownerStudentId = row.student_id == null ? null : Number(row.student_id);

  const identityMatch =
    (ownerUserId != null && ownerUserId === uid) ||
    (ownerStudentId != null && ownerStudentId === uid);

  if (!identityMatch) {
    throw new AttemptNotOwnedError({
      attemptId: row.id,
      userId: uid,
      ownerId: ownerUserId ?? ownerStudentId,
    });
  }
}

/**
 * @param {number} studentId
 * @param {number} attemptId
 */
export async function loadStudentAttemptPage(studentId, attemptId) {
  logger.info('student attempt load requested', { studentId, attemptId });

  const [[attemptRow]] = await mysqlPool.query(LOAD_ATTEMPT_WITH_TEST_SQL, [attemptId]);

  if (!attemptRow) {
    throw new AttemptNotFoundError({ attemptId, studentId });
  }

  assertAttemptBelongsToStudent(attemptRow, studentId);

  const owns = await studentOwnsAttempt(studentId, attemptId);
  if (!owns) {
    throw new AttemptNotFoundError({ attemptId, studentId, reason: 'not_authorized' });
  }

  await assertAttemptLoadable(attemptRow);

  const testId = Number(attemptRow.test_id);
  const composedQuestions = await loadComposedTestQuestions(testId, {
    audience: 'student',
    logOrphans: true,
  });

  const [savedAnswerRows] = await mysqlPool.query(LOAD_SAVED_ANSWERS_SQL, [attemptId]);

  const response = toStudentAttemptLoadResponse(
    attemptRow,
    composedQuestions,
    savedAnswerRows,
    Date.now()
  );

  logger.info('student attempt load resolved', {
    studentId,
    attemptId,
    testId,
    questionCount: response.questions.length,
    savedAnswerCount: response.savedAnswers.length,
  });

  return response;
}
