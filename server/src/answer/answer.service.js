/**
 * Answer Storage Module — validate and persist student answers only.
 *
 * Attempt ownership, expiry, and token checks are delegated to attemptGuard.
 */

import {
  InvalidOptionError,
  QuestionNotInTestError,
} from '../errors/testAttempt/TestAttemptErrors.js';
import { StructuredLogger } from '../utils/requestId.js';
import {
  OPTION_BELONGS_TO_QUESTION_SQL,
  QUESTION_BELONGS_TO_TEST_SQL,
  UPSERT_STUDENT_ANSWER_SQL,
} from './answer.queries.js';

const logger = new StructuredLogger({ service: 'answerStorage' });

/**
 * @typedef {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} DbExecutor
 */

/**
 * @typedef {object} AttemptSessionContext
 * @property {number} id
 * @property {number} testId
 * @property {number} studentId
 * @property {string} status
 */

/**
 * @typedef {object} AnswerSubmissionInput
 * @property {number} questionId
 * @property {number} selectedOptionId
 */

/**
 * @typedef {object} ValidatedAnswerSubmission
 * @property {number} attemptId
 * @property {number} testId
 * @property {number} questionId
 * @property {number} selectedOptionId
 */

/**
 * Step 2 + 3: question belongs to test; option belongs to question.
 *
 * @param {DbExecutor} db
 * @param {AttemptSessionContext} attemptSession
 * @param {AnswerSubmissionInput} input
 * @returns {Promise<ValidatedAnswerSubmission>}
 */
export async function validateAnswerSubmission(db, attemptSession, input) {
  const attemptId = Number(attemptSession.id);
  const testId = Number(attemptSession.testId);
  const questionId = Number(input.questionId);
  const selectedOptionId = Number(input.selectedOptionId);

  const [[questionRow]] = await db.query(QUESTION_BELONGS_TO_TEST_SQL, [testId, questionId]);
  if (!questionRow) {
    logger.warn('answer rejected — question not in test', {
      event: 'ANSWER_QUESTION_REJECTED',
      attemptId,
      testId,
      questionId,
    });
    throw new QuestionNotInTestError({ attemptId, questionId, testId });
  }

  const [[optionRow]] = await db.query(OPTION_BELONGS_TO_QUESTION_SQL, [
    selectedOptionId,
    questionId,
  ]);
  if (!optionRow) {
    logger.warn('answer rejected — option mismatch', {
      event: 'ANSWER_OPTION_REJECTED',
      attemptId,
      questionId,
      selectedOptionId,
    });
    throw new InvalidOptionError({ questionId, optionId: selectedOptionId });
  }

  return { attemptId, testId, questionId, selectedOptionId };
}

/**
 * Validate then UPSERT one answer (one row per attempt + question).
 *
 * @param {DbExecutor} db
 * @param {AttemptSessionContext} attemptSession
 * @param {AnswerSubmissionInput} input
 */
export async function saveAnswer(db, attemptSession, input) {
  const validated = await validateAnswerSubmission(db, attemptSession, input);

  await db.query(UPSERT_STUDENT_ANSWER_SQL, [
    validated.attemptId,
    validated.questionId,
    validated.selectedOptionId,
  ]);

  logger.info('answer saved', {
    event: 'ANSWER_SAVED',
    attemptId: validated.attemptId,
    questionId: validated.questionId,
    selectedOptionId: validated.selectedOptionId,
  });

  return { saved: true };
}
