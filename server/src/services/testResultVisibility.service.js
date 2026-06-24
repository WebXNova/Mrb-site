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
    let selectedOptionText = item.selectedOptionText == null ? '' : String(item.selectedOptionText);
    const correctOptionText = item.correctOptionText == null ? '' : String(item.correctOptionText);
    const isCorrect = Boolean(item.isCorrect);

    if (!selectedOptionText && item.selectedOptionId != null && isCorrect) {
      selectedOptionText = correctOptionText;
    }

    const row = {
      questionId: item.questionId,
      questionText: sanitizeRichHtml(item.questionText),
      questionImageUrl: item.questionImageUrl ?? null,
      selectedOptionId: item.selectedOptionId ?? null,
      selectedOptionKey: item.selectedOptionKey == null ? '' : String(item.selectedOptionKey),
      selectedOptionText,
      correctOptionId: item.correctOptionId ?? null,
      correctOptionKey: item.correctOptionKey == null ? '' : String(item.correctOptionKey),
      correctOptionText,
      isCorrect,
      marks: item.marks,
      marksAwarded: item.marksAwarded,
      selectedOption: item.selectedOption == null ? '' : String(item.selectedOption),
      correctOption: item.correctOption == null ? '' : String(item.correctOption),
      options: Array.isArray(item.options) ? item.options.map((o) => ({
        id: o.id ?? o.optionId,
        key: o.key ?? o.optionKey ?? '',
        text: o.text ?? o.optionText ?? '',
        imageUrl: o.imageUrl ?? null,
        isCorrect: Boolean(o.isCorrect ?? o.is_correct),
      })) : undefined,
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
 * @param {Map<number, Array<Record<string, unknown>>>} [optionsMap]
 */
export async function loadSanitizedPortalAnswerReview(
  settings,
  db,
  attemptId,
  testId,
  loadRows,
  optionsMap
) {
  if (!isShowAnswersAfterSubmitEnabled(settings?.show_answers_after_submit)) {
    return null;
  }

  const showExplanations = isShowExplanationsEnabled(settings?.show_explanations);
  const rows = await loadRows(db, attemptId, testId);

  return rows.map((row) => {
    const questionId = Number(row.question_id);
    let selectedText = row.selected_option_text == null ? '' : String(row.selected_option_text);
    const correctText = row.correct_option_text == null ? '' : String(row.correct_option_text);
    const status = String(row.answer_status ?? 'unanswered');

    if (!selectedText && row.selected_option_id != null && status === 'correct') {
      selectedText = correctText;
    }

    /** @type {Record<string, unknown>} */
    const item = {
      question_id: questionId,
      question: sanitizeRichHtml(row.question_text),
      question_image_url: row.question_image_url == null ? null : String(row.question_image_url),
      your_answer: selectedText,
      correct_answer: correctText,
      selected_option_id: row.selected_option_id == null ? null : Number(row.selected_option_id),
      selected_option_key: row.selected_option_key == null ? null : String(row.selected_option_key),
      correct_option_key: row.correct_option_key == null ? null : String(row.correct_option_key),
      status,
    };

    if (showExplanations && row.explanation != null) {
      item.explanation = sanitizeRichHtml(row.explanation);
    }

    if (optionsMap && optionsMap.has(questionId)) {
      item.options = optionsMap.get(questionId).map((o) => ({
        id: o.optionId,
        key: o.optionKey,
        text: o.optionText,
        imageUrl: o.imageUrl,
        isCorrect: o.isCorrect,
      }));
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
 * @param {Array<Record<string, unknown>>|null} answers
 */
export function mapPortalAnswersToLegacyDetails(answers) {
  if (!Array.isArray(answers) || !answers.length) {
    return undefined;
  }

  return answers.map((item) => ({
    questionId: item.question_id ?? null,
    questionText: item.question,
    questionImageUrl: item.question_image_url ?? null,
    selectedOptionId: item.selected_option_id == null ? null : Number(item.selected_option_id),
    selectedOptionKey: item.selected_option_key ?? null,
    selectedOptionText: item.your_answer ?? '',
    correctOptionKey: item.correct_option_key ?? null,
    correctOptionText: item.correct_answer ?? '',
    isCorrect: item.status === 'correct',
    status: item.status ?? 'unanswered',
    options: Array.isArray(item.options) ? item.options : undefined,
    explanation: item.explanation ?? '',
  }));
}
