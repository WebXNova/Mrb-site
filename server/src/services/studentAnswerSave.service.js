/**
 * Persist a single student answer during an in-progress attempt (Phase 2C).
 *
 * Lightweight autosave path — no grading, no score, no result writes.
 */

import { mysqlPool } from '../config/mysql.js';
import { StructuredLogger } from '../utils/requestId.js';
import { studentOwnsAttempt } from './attemptOwnership.service.js';
import { isShuffleEnabled } from './attemptDeliveryLayout.service.js';
import {
  assertAttemptBelongsToStudent,
  assertAttemptLoadable,
} from './studentAttemptLoad.service.js';
import { LOAD_ATTEMPT_WITH_TEST_SQL } from './studentAttemptLoad.queries.js';
import {
  TOUCH_ATTEMPT_LAST_ACTIVITY_SQL,
  UPSERT_STUDENT_ANSWER_SQL,
} from './studentAnswerSave.queries.js';
import {
  AttemptInvalidStateError,
  AttemptNotFoundError,
} from '../errors/testAttempt/TestAttemptErrors.js';
import {
  resolveAttemptExamSnapshot,
  assertAnswerBelongsToExamSnapshot,
} from './attemptExamSnapshot.service.js';

const logger = new StructuredLogger({ service: 'studentAnswerSave' });

/**
 * @param {{
 *   studentId: number,
 *   attemptId: number,
 *   questionId: number,
 *   selectedOptionId: number,
 * }} input
 * @returns {Promise<{ saved: true }>}
 */
export async function saveStudentAttemptAnswer(input) {
  const studentId = Number(input.studentId);
  const attemptId = Number(input.attemptId);
  const questionId = Number(input.questionId);
  const selectedOptionId = Number(input.selectedOptionId);

  logger.debug('student answer save requested', {
    studentId,
    attemptId,
    questionId,
  });

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

  const snapshot = await resolveAttemptExamSnapshot({
    attemptId,
    testId: Number(attemptRow.test_id),
    examSnapshotJson: attemptRow.exam_snapshot_json,
    deliveryLayoutJson: attemptRow.delivery_layout_json,
    attemptNonce: attemptRow.attempt_nonce,
    shuffleQuestions: isShuffleEnabled(attemptRow.shuffle_questions),
    shuffleOptions: isShuffleEnabled(attemptRow.shuffle_options),
    testRow: attemptRow,
  });

  assertAnswerBelongsToExamSnapshot(snapshot, {
    attemptId,
    questionId,
    optionId: selectedOptionId,
  });

  const [upsertResult] = await mysqlPool.query(UPSERT_STUDENT_ANSWER_SQL, [
    questionId,
    selectedOptionId,
    attemptId,
    studentId,
    studentId,
  ]);

  if (Number(upsertResult?.affectedRows ?? 0) === 0) {
    throw new AttemptInvalidStateError({
      attemptId,
      status: 'not_in_progress',
      required: 'in_progress',
      reason: 'autosave_rejected_after_submit_or_expiry',
    });
  }

  const [touchResult] = await mysqlPool.query(TOUCH_ATTEMPT_LAST_ACTIVITY_SQL, [
    attemptId,
    studentId,
    studentId,
  ]);

  // Answer is durable after UPSERT. Touch is best-effort — submit may have claimed
  // the attempt between UPSERT and touch under rare interleaving after unlock.
  if (Number(touchResult?.affectedRows ?? 0) === 0) {
    logger.warn('student answer saved but last_activity touch skipped', {
      studentId,
      attemptId,
      questionId,
      reason: 'attempt_not_in_progress_after_save',
    });
  }

  logger.info('student answer saved', {
    studentId,
    attemptId,
    questionId,
  });

  return { saved: true };
}
