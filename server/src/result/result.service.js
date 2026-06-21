/**
 * Result API — read-only service (never grades, never writes).
 *
 * Source of truth: test_results only.
 */

import { mysqlPool } from '../config/mysql.js';
import { ATTEMPT_DB_STATUS } from '../attempt/attempt.constants.js';
import { parsePositiveInt } from '../attempt/attempt.util.js';
import { StructuredLogger } from '../utils/requestId.js';
import { resolveAttemptTimeTakenSeconds } from '../services/attemptTiming.service.js';
import { ResultNotFoundError } from './result.errors.js';
import {
  assertStudentResultVisible,
  isShowAnswersAfterSubmitEnabled,
  isShowExplanationsEnabled,
  loadSanitizedPortalAnswerReview,
} from '../services/testResultVisibility.service.js';
import {
  loadDetailedAnswerRows,
  loadResultContextRow,
} from './result.repository.js';

const logger = new StructuredLogger({ service: 'resultApi' });

/**
 * @typedef {Record<string, unknown>} ResultContextRow
 */

/**
 * @param {ResultContextRow} row
 * @param {number} studentId
 */
function assertResultOwnership(row, studentId) {
  const ownerStudentId = row.student_id == null ? null : Number(row.student_id);
  const ownerUserId = row.user_id == null ? null : Number(row.user_id);

  const owns =
    (ownerStudentId != null && ownerStudentId === studentId) ||
    (ownerUserId != null && ownerUserId === studentId);

  if (!owns) {
    logger.warn('result access denied — ownership mismatch', {
      event: 'RESULT_ACCESS_DENIED',
      attemptId: row.attempt_id,
      studentId,
    });
    throw new ResultNotFoundError({ attemptId: row.attempt_id, reason: 'not_authorized' });
  }
}

/**
 * @param {ResultContextRow} row
 */
function assertResultVisibility(row) {
  if (String(row.attempt_status) !== ATTEMPT_DB_STATUS.SUBMITTED) {
    throw new ResultNotFoundError({
      attemptId: row.attempt_id,
      reason: 'attempt_not_submitted',
    });
  }

  assertStudentResultVisible(row, {
    attemptId: row.attempt_id,
    context: 'result.service.assertResultVisibility',
  });
}

/**
 * @param {ResultContextRow} row
 */
export function getResultSummary(row) {
  return {
    score: Number(row.score ?? 0),
    max_score: row.max_score == null ? null : Number(row.max_score),
    percentage: Number(row.percentage ?? 0),
    status: String(row.pass_status ?? ''),
    correct_answers: Number(row.correct_answers ?? 0),
    wrong_answers: Number(row.wrong_answers ?? 0),
    unanswered_answers: Number(row.unanswered_answers ?? 0),
    time_taken_seconds: resolveAttemptTimeTakenSeconds({
      startedAt: row.started_at,
      submittedAt: row.submitted_at,
      storedSeconds: row.time_taken_seconds,
    }),
  };
}

/**
 * @param {ResultContextRow} context
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} [db]
 */
export async function getDetailedResult(context, db = mysqlPool) {
  return loadSanitizedPortalAnswerReview(
    context,
    db,
    Number(context.attempt_id),
    Number(context.test_id),
    loadDetailedAnswerRows
  );
}

/**
 * Load and authorize result context for an attempt.
 *
 * @param {number} attemptId
 * @param {number} studentId
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} [db]
 */
async function resolveAuthorizedResultContext(attemptId, studentId, db = mysqlPool) {
  const aid = parsePositiveInt(attemptId);
  const sid = parsePositiveInt(studentId);
  if (aid == null || sid == null) {
    throw new ResultNotFoundError({ reason: 'invalid_ids' });
  }

  const row = await loadResultContextRow(db, aid);
  if (!row) {
    throw new ResultNotFoundError({ attemptId: aid, reason: 'result_not_found' });
  }

  assertResultOwnership(row, sid);
  assertResultVisibility(row);

  return row;
}

/**
 * Full result payload — summary plus optional detailed answers.
 *
 * @param {number} studentId
 * @param {number} attemptId
 */
export async function getResult(studentId, attemptId) {
  const context = await resolveAuthorizedResultContext(attemptId, studentId);
  const summary = getResultSummary(context);
  const answers = await getDetailedResult(context);

  logger.info('result fetched', {
    event: 'RESULT_FETCHED',
    attemptId: context.attempt_id,
    studentId,
    hasDetailedAnswers: Array.isArray(answers),
  });

  return {
    result_id: Number(context.result_id),
    test_title: String(context.test_title ?? ''),
    test_id: Number(context.test_id),
    submitted_at: context.submitted_at == null ? null : String(context.submitted_at),
    summary,
    ...(answers ? { answers } : {}),
    visibility: {
      showAnswersAfterSubmit: isShowAnswersAfterSubmitEnabled(context.show_answers_after_submit),
      showExplanations: isShowExplanationsEnabled(context.show_explanations),
    },
  };
}
