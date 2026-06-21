/**
 * G-RT-07 — Authoritative student result visibility (`show_result_immediately`,
 * `show_answers_after_submit`, `show_explanations`).
 *
 * All student-facing result reads must pass through these guards before returning
 * scores or answer review data.
 */

import { sanitizeRichHtml } from '../utils/htmlSanitizer.js';
import { ResultNotAccessibleError } from '../result/result.errors.js';

/**
 * @typedef {object} TestResultVisibilitySettings
 * @property {unknown} [show_result_immediately]
 * @property {unknown} [show_answers_after_submit]
 * @property {unknown} [show_explanations]
 */

/**
 * @param {unknown} value
 * @returns {boolean}
 */
export function isShowResultImmediatelyEnabled(value) {
  return Boolean(Number(value ?? 0));
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
export function isShowAnswersAfterSubmitEnabled(value) {
  return Boolean(Number(value ?? 0));
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
export function isShowExplanationsEnabled(value) {
  return Boolean(Number(value ?? 1));
}

/**
 * Fail-closed — no summary or review when results are withheld.
 *
 * @param {TestResultVisibilitySettings|null|undefined} settings
 * @param {{ attemptId?: number, context?: string }} [options]
 */
export function assertStudentResultVisible(settings, options = {}) {
  if (isShowResultImmediatelyEnabled(settings?.show_result_immediately)) {
    return;
  }

  throw new ResultNotAccessibleError({
    attemptId: options.attemptId ?? null,
    reason: 'show_result_immediately_disabled',
    context: options.context ?? 'testResultVisibility.assertStudentResultVisible',
  });
}

/**
 * Map grading snapshot rows to slug-runtime `details` (no options[] metadata).
 *
 * @param {Array<Record<string, unknown>>|null|undefined} details
 * @param {TestResultVisibilitySettings|null|undefined} settings
 * @returns {Array<Record<string, unknown>>|null}
 */
export function sanitizeGradingDetailItems(details, settings) {
  if (!isShowAnswersAfterSubmitEnabled(settings?.show_answers_after_submit)) {
    return null;
  }

  const showExplanations = isShowExplanationsEnabled(settings?.show_explanations);
  const items = Array.isArray(details) ? details : [];

  return items.map((item) => {
    const row = {
      questionId: item.questionId,
      questionText: sanitizeRichHtml(item.questionText),
      selectedOptionId: item.selectedOptionId ?? null,
      selectedOptionText: item.selectedOptionText == null ? '' : String(item.selectedOptionText),
      correctOptionId: item.correctOptionId ?? null,
      correctOptionText: item.correctOptionText == null ? '' : String(item.correctOptionText),
      isCorrect: Boolean(item.isCorrect),
      marks: item.marks,
      marksAwarded: item.marksAwarded,
      selectedOption: item.selectedOption == null ? '' : String(item.selectedOption),
      correctOption: item.correctOption == null ? '' : String(item.correctOption),
    };

    if (showExplanations && item.explanation != null && String(item.explanation).trim() !== '') {
      row.explanation = sanitizeRichHtml(item.explanation);
    }

    return row;
  });
}

/**
 * Portal-style answer review rows (Result API shape).
 *
 * @param {TestResultVisibilitySettings|null|undefined} settings
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} db
 * @param {number} attemptId
 * @param {number} testId
 * @param {(db: import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection, attemptId: number, testId: number) => Promise<Array<Record<string, unknown>>>} loadRows
 */
export async function loadSanitizedPortalAnswerReview(
  settings,
  db,
  attemptId,
  testId,
  loadRows
) {
  if (!isShowAnswersAfterSubmitEnabled(settings?.show_answers_after_submit)) {
    return null;
  }

  const showExplanations = isShowExplanationsEnabled(settings?.show_explanations);
  const rows = await loadRows(db, attemptId, testId);

  return rows.map((row) => {
    /** @type {Record<string, string>} */
    const item = {
      question: sanitizeRichHtml(row.question_text),
      your_answer: row.selected_option_text == null ? '' : String(row.selected_option_text),
      correct_answer: row.correct_option_text == null ? '' : String(row.correct_option_text),
      status: String(row.answer_status ?? 'unanswered'),
    };

    if (showExplanations && row.explanation != null) {
      item.explanation = sanitizeRichHtml(row.explanation);
    }

    return item;
  });
}

/**
 * Redact list/dashboard aggregates when results are withheld.
 *
 * @param {Record<string, unknown>} row
 */
export function redactStudentResultListItem(row) {
  const resultVisible = isShowResultImmediatelyEnabled(row.show_result_immediately);

  return {
    resultAvailable: resultVisible,
    score: resultVisible ? Number(row.score ?? 0) : null,
    maxScore: resultVisible && row.max_score != null ? Number(row.max_score) : null,
    percentage: resultVisible ? Number(row.percentage ?? 0) : null,
    status: resultVisible ? String(row.pass_status ?? row.status ?? '') : null,
  };
}

/**
 * Map portal answer rows to legacy `details` field for student portal consumers.
 *
 * @param {Array<Record<string, string>>|null} answers
 */
export function mapPortalAnswersToLegacyDetails(answers) {
  if (!Array.isArray(answers) || !answers.length) {
    return undefined;
  }

  return answers.map((item) => ({
    questionText: item.question,
    selectedOptionText: item.your_answer,
    correctOptionText: item.correct_answer,
    isCorrect: item.status === 'correct',
    explanation: item.explanation ?? '',
  }));
}
