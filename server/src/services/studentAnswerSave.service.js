/**
 * Persist a single student answer during an in-progress attempt (Phase 2C).
 *
 * Lightweight autosave path — no grading, no score, no result writes.
 */

import { mysqlPool } from '../config/mysql.js';
import { StructuredLogger } from '../utils/requestId.js';
import { studentOwnsAttempt } from './attemptOwnership.service.js';
import {
  assertAttemptBelongsToStudent,
  assertAttemptLoadable,
} from './studentAttemptLoad.service.js';
import { LOAD_ATTEMPT_WITH_TEST_SQL } from './studentAttemptLoad.queries.js';
import {
  OPTION_BELONGS_TO_QUESTION_SQL,
  QUESTION_BELONGS_TO_TEST_SQL,
  TOUCH_ATTEMPT_LAST_ACTIVITY_SQL,
  UPSERT_STUDENT_ANSWER_SQL,
} from './studentAnswerSave.queries.js';
import {
  AttemptNotFoundError,
  InvalidOptionError,
  QuestionNotInTestError,
} from '../errors/testAttempt/TestAttemptErrors.js';

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

  const testId = Number(attemptRow.test_id);

  const [[questionRow]] = await mysqlPool.query(QUESTION_BELONGS_TO_TEST_SQL, [testId, questionId]);
  if (!questionRow) {
    throw new QuestionNotInTestError({
      attemptId,
      questionId,
      testId,
    });
  }

  const [[optionRow]] = await mysqlPool.query(OPTION_BELONGS_TO_QUESTION_SQL, [
    selectedOptionId,
    questionId,
  ]);
  if (!optionRow) {
    throw new InvalidOptionError({ questionId, optionId: selectedOptionId });
  }

  await mysqlPool.query(UPSERT_STUDENT_ANSWER_SQL, [attemptId, questionId, selectedOptionId]);

  const [touchResult] = await mysqlPool.query(TOUCH_ATTEMPT_LAST_ACTIVITY_SQL, [
    attemptId,
    studentId,
    studentId,
  ]);

  if (Number(touchResult?.affectedRows ?? 0) === 0) {
    throw new AttemptNotFoundError({
      attemptId,
      studentId,
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
