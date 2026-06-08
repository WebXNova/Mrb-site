/**
 * Grading Engine — sole source of grading truth.
 *
 * Invoked after Submit module locks attempt (status = submitted).
 * Idempotent: existing result rows are returned without re-grading.
 */

import { mysqlPool } from '../config/mysql.js';
import { ATTEMPT_DB_STATUS } from '../attempt/attempt.constants.js';
import { StructuredLogger } from '../utils/requestId.js';
import {
  GradingAttemptNotFoundError,
  GradingDataMissingError,
  GradingInvalidStatusError,
  GradingPersistenceError,
} from './grading.errors.js';
import {
  findExistingResult,
  insertGradingResult,
  loadGradingQuestionRows,
  lockSubmittedAttempt,
} from './grading.repository.js';

const logger = new StructuredLogger({ service: 'gradingEngine' });

/**
 * @typedef {object} GradingTestConfig
 * @property {number} passingPercentage
 * @property {boolean} negativeMarkingEnabled
 * @property {number} negativeMarkingValue
 */

/**
 * @typedef {object} GradingQuestionRow
 * @property {number} questionId
 * @property {number|null} selectedOptionId
 * @property {number|null} correctOptionId
 */

/**
 * @typedef {object} CalculatedResult
 * @property {number} totalQuestions
 * @property {number} correctAnswers
 * @property {number} wrongAnswers
 * @property {number} unansweredAnswers
 * @property {number} score
 * @property {number} maxScore
 * @property {number} percentage
 * @property {string} passStatus
 */

/**
 * Pure calculation — no I/O, no trust of client values.
 *
 * @param {{
 *   questions: GradingQuestionRow[],
 *   testConfig: GradingTestConfig,
 * }} input
 * @returns {CalculatedResult}
 */
export function calculateResult({ questions, testConfig }) {
  const totalQuestions = questions.length;
  let correctAnswers = 0;
  let wrongAnswers = 0;
  let unansweredAnswers = 0;
  let maxScore = 0;

  for (const question of questions) {
    maxScore += 1;

    const selected =
      question.selectedOptionId == null ? null : Number(question.selectedOptionId);
    const correctOptionId =
      question.correctOptionId == null ? null : Number(question.correctOptionId);

    if (selected == null) {
      unansweredAnswers += 1;
      continue;
    }

    if (correctOptionId != null && selected === correctOptionId) {
      correctAnswers += 1;
    } else {
      wrongAnswers += 1;
    }
  }

  let score = correctAnswers;
  if (testConfig.negativeMarkingEnabled && testConfig.negativeMarkingValue > 0) {
    score = correctAnswers - wrongAnswers * testConfig.negativeMarkingValue;
  }
  score = Math.max(0, Number(score.toFixed(2)));

  const percentage =
    totalQuestions > 0
      ? Number(((correctAnswers / totalQuestions) * 100).toFixed(2))
      : 0;

  const passStatus =
    percentage >= testConfig.passingPercentage ? 'PASS' : 'FAIL';

  return {
    totalQuestions,
    correctAnswers,
    wrongAnswers,
    unansweredAnswers,
    score,
    maxScore,
    percentage,
    passStatus,
  };
}

/**
 * @param {Record<string, unknown>} row
 * @returns {import('./grading.repository.js').ReturnType<typeof findExistingResult> extends Promise<infer T> ? NonNullable<T> : never}
 */
function toResultResponse(row) {
  return {
    result_id: Number(row.result_id),
    attempt_id: Number(row.attempt_id),
    score: Number(row.score),
    percentage: Number(row.percentage),
    correct_answers: Number(row.correct_answers),
    wrong_answers: Number(row.wrong_answers),
    unanswered_answers: Number(row.unanswered_answers),
    pass_status: String(row.pass_status ?? ''),
    time_taken_seconds: Number(row.time_taken_seconds ?? 0),
  };
}

/**
 * @param {import('mysql2/promise').PoolConnection} connection
 * @param {object} input
 */
export async function createResult(connection, input) {
  const attemptId = Number(input.attemptId);
  const studentId = Number(input.studentId);
  const courseId = Number(input.courseId);
  const calculated = input.calculated;
  const timeTakenSeconds = Number(input.timeTakenSeconds);

  const insertResult = await insertGradingResult(connection, {
    attemptId,
    studentId,
    courseId,
    totalQuestions: calculated.totalQuestions,
    correctAnswers: calculated.correctAnswers,
    wrongAnswers: calculated.wrongAnswers,
    unansweredAnswers: calculated.unansweredAnswers,
    score: calculated.score,
    maxScore: calculated.maxScore,
    percentage: calculated.percentage,
    passStatus: calculated.passStatus,
    timeTakenSeconds,
  });

  if (Number(insertResult?.affectedRows ?? 0) !== 1) {
    throw new GradingPersistenceError({ attemptId, reason: 'insert_affected_zero_rows' });
  }

  const persisted = await findExistingResult(connection, attemptId);
  if (!persisted) {
    throw new GradingPersistenceError({ attemptId, reason: 'result_not_found_after_insert' });
  }

  logger.info('grading result created', {
    event: 'GRADING_RESULT_CREATED',
    attemptId,
    resultId: persisted.result_id,
    passStatus: calculated.passStatus,
  });

  return toResultResponse(persisted);
}

/**
 * @param {Record<string, unknown>} attemptRow
 * @param {Array<Record<string, unknown>>} questionRows
 */
function buildGradingContext(attemptRow, questionRows) {
  const negativeMarkingValue = Number(attemptRow.negative_marking ?? 0);

  return {
    attemptId: Number(attemptRow.id),
    studentId: Number(attemptRow.student_id),
    courseId: Number(attemptRow.course_id),
    timeTakenSeconds: Math.max(0, Number(attemptRow.time_taken_seconds ?? 0)),
    testConfig: {
      passingPercentage: Number(attemptRow.passing_percentage ?? 0),
      negativeMarkingEnabled: negativeMarkingValue > 0,
      negativeMarkingValue,
    },
    questions: questionRows.map((row) => ({
      questionId: Number(row.question_id),
      selectedOptionId:
        row.selected_option_id == null ? null : Number(row.selected_option_id),
      correctOptionId:
        row.correct_option_id == null ? null : Number(row.correct_option_id),
    })),
  };
}

/**
 * Core grading pipeline (expects caller transaction + row lock when concurrent safety required).
 *
 * @param {number} attemptId
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} db
 */
async function runGradingPipeline(attemptId, db) {
  const aid = Number(attemptId);
  if (!Number.isInteger(aid) || aid <= 0) {
    throw new GradingAttemptNotFoundError({ attemptId, reason: 'invalid_attempt_id' });
  }

  const attemptRow = await lockSubmittedAttempt(db, aid);
  if (!attemptRow) {
    throw new GradingAttemptNotFoundError({ attemptId: aid });
  }

  if (String(attemptRow.status) !== ATTEMPT_DB_STATUS.SUBMITTED) {
    throw new GradingInvalidStatusError({
      attemptId: aid,
      status: attemptRow.status,
    });
  }

  const existing = await findExistingResult(db, aid);
  if (existing) {
    logger.info('grading skipped — result already exists', {
      event: 'GRADING_IDEMPOTENT_HIT',
      attemptId: aid,
      resultId: existing.result_id,
    });
    return toResultResponse(existing);
  }

  const questionRows = await loadGradingQuestionRows(db, aid, Number(attemptRow.test_id));
  if (!questionRows.length) {
    throw new GradingDataMissingError({
      attemptId: aid,
      testId: attemptRow.test_id,
      reason: 'no_questions_for_test',
    });
  }

  const context = buildGradingContext(attemptRow, questionRows);
  const calculated = calculateResult({
    questions: context.questions,
    testConfig: context.testConfig,
  });

  try {
    return await createResult(db, {
      attemptId: aid,
      studentId: context.studentId,
      courseId: context.courseId,
      calculated,
      timeTakenSeconds: context.timeTakenSeconds,
    });
  } catch (error) {
    if (error?.code === 'ER_DUP_ENTRY') {
      const raced = await findExistingResult(db, aid);
      if (raced) {
        return toResultResponse(raced);
      }
    }
    throw error;
  }
}

/**
 * Grade a submitted attempt — transaction-safe when no connection is supplied.
 *
 * @param {number} attemptId
 * @param {import('mysql2/promise').PoolConnection} [connection]
 * @returns {Promise<{
 *   resultId: number,
 *   attempt_id: number,
 *   score: number,
 *   percentage: number,
 *   correct_answers: number,
 *   wrong_answers: number,
 *   unanswered_answers: number,
 *   pass_status: string,
 *   time_taken_seconds: number,
 * }>}
 */
export async function gradeAttempt(attemptId, connection) {
  const ownsTransaction = !connection;
  const db = connection ?? (await mysqlPool.getConnection());

  try {
    if (ownsTransaction) {
      await db.beginTransaction();
    }

    const result = await runGradingPipeline(attemptId, db);

    if (ownsTransaction) {
      await db.commit();
    }

    return {
      resultId: result.result_id,
      attempt_id: result.attempt_id,
      score: result.score,
      percentage: result.percentage,
      correct_answers: result.correct_answers,
      wrong_answers: result.wrong_answers,
      unanswered_answers: result.unanswered_answers,
      pass_status: result.pass_status,
      time_taken_seconds: result.time_taken_seconds,
    };
  } catch (error) {
    if (ownsTransaction) {
      try {
        await db.rollback();
      } catch (rollbackError) {
        logger.error('grading rollback failed', {
          attemptId,
          message: rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
        });
      }
    }
    throw error;
  } finally {
    if (ownsTransaction) {
      db.release();
    }
  }
}
