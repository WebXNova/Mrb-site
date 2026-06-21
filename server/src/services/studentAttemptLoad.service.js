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
import {
  isShuffleEnabled,
  loadComposedQuestionsWithAttemptLayout,
} from './attemptDeliveryLayout.service.js';
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
import {
  assertTestAvailabilityWindow,
  AVAILABILITY_PHASE,
  getAvailabilityNowMs,
} from './testAvailabilityWindow.service.js';

const logger = new StructuredLogger({ service: 'studentAttemptLoad' });

/**
 * @param {Record<string, unknown>|null|undefined} row
 * @param {number} [nowMs]
 */
export async function assertAttemptLoadable(row, nowMs, options = {}) {
  if (!row) {
    throw new AttemptNotFoundError({ reason: 'attempt_not_found' });
  }

  const resolvedNowMs =
    nowMs != null && Number.isFinite(nowMs)
      ? nowMs
      : await getAvailabilityNowMs(options.executor ?? mysqlPool);

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
    nowMs: resolvedNowMs,
    executor: options.executor,
    markExpired: options.markExpired,
  });

  assertTestAvailabilityWindow(
    {
      id: row.test_id,
      start_date: row.start_date,
      end_date: row.end_date,
    },
    {
      phase: AVAILABILITY_PHASE.IN_PROGRESS,
      nowMs: resolvedNowMs,
      attemptStartedAt: row.started_at,
      context: 'studentAttemptLoad.assertAttemptLoadable',
    }
  );
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

  const loadNowMs = await getAvailabilityNowMs(mysqlPool);

  const testId = Number(attemptRow.test_id);
  const composedQuestions = await loadComposedQuestionsWithAttemptLayout({
    attemptId,
    testId,
    shuffleQuestions: isShuffleEnabled(attemptRow.shuffle_questions),
    shuffleOptions: isShuffleEnabled(attemptRow.shuffle_options),
    deliveryLayoutJson: attemptRow.delivery_layout_json,
    attemptNonce: attemptRow.attempt_nonce,
    audience: 'student',
  });

  const [savedAnswerRows] = await mysqlPool.query(LOAD_SAVED_ANSWERS_SQL, [attemptId]);

  const response = toStudentAttemptLoadResponse(
    attemptRow,
    composedQuestions,
    savedAnswerRows,
    loadNowMs
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
