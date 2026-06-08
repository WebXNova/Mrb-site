import { sanitizeRichHtml } from '../utils/htmlSanitizer.js';

/** Fields that must never appear in student attempt load payloads. */
export const FORBIDDEN_STUDENT_ATTEMPT_LOAD_KEYS = Object.freeze([
  'is_correct',
  'isCorrect',
  'correct_answer',
  'correctAnswer',
  'correct_option_id',
  'correctOptionId',
  'explanation',
  'marks_awarded',
  'marksAwarded',
]);

/**
 * @param {unknown} expiresAt
 * @param {number} [nowMs]
 * @returns {number}
 */
export function computeRemainingTimeSeconds(expiresAt, nowMs = Date.now()) {
  if (expiresAt == null) return 0;
  const expiresMs = new Date(expiresAt).getTime();
  if (Number.isNaN(expiresMs)) return 0;
  return Math.max(0, Math.floor((expiresMs - nowMs) / 1000));
}

/**
 * @param {unknown} value
 * @returns {string|null}
 */
function toIsoDateTime(value) {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * @param {Record<string, unknown>} row
 * @param {number} [nowMs]
 */
export function toStudentAttemptLoadAttemptDto(row, nowMs = Date.now()) {
  return {
    attemptId: Number(row.id),
    testId: Number(row.test_id),
    status: String(row.status ?? ''),
    startedAt: toIsoDateTime(row.started_at),
    expiresAt: toIsoDateTime(row.expires_at),
    remainingTimeSeconds: computeRemainingTimeSeconds(row.expires_at, nowMs),
  };
}

/**
 * @param {Array<{ questionId: number, questionText: string, marks: number, options?: Array<{ optionId: number, optionText: string }> }>} composed
 */
export function toStudentAttemptLoadQuestionsDto(composed) {
  return composed.map((question) => ({
    question_id: Number(question.questionId),
    question_text: sanitizeRichHtml(question.questionText),
    marks: Number(question.marks ?? 0),
    options: (question.options || []).map((option) => ({
      option_id: Number(option.optionId),
      option_text: String(option.optionText ?? ''),
    })),
  }));
}

/**
 * @param {Array<Record<string, unknown>>} rows
 */
export function toStudentAttemptLoadSavedAnswersDto(rows) {
  return rows.map((row) => ({
    question_id: Number(row.question_id),
    selected_option_id:
      row.selected_option_id == null ? null : Number(row.selected_option_id),
  }));
}

/**
 * @param {Record<string, unknown>} attemptRow
 * @param {Array<Record<string, unknown>>} composedQuestions
 * @param {Array<Record<string, unknown>>} savedAnswerRows
 * @param {number} [nowMs]
 */
export function toStudentAttemptLoadResponse(attemptRow, composedQuestions, savedAnswerRows, nowMs) {
  return {
    attempt: toStudentAttemptLoadAttemptDto(attemptRow, nowMs),
    questions: toStudentAttemptLoadQuestionsDto(composedQuestions),
    savedAnswers: toStudentAttemptLoadSavedAnswersDto(savedAnswerRows),
  };
}

export const STUDENT_ATTEMPT_LOAD_RESPONSE_SCHEMA = Object.freeze({
  attempt: Object.freeze({
    attemptId: 'number',
    testId: 'number',
    status: 'string',
    startedAt: 'string | null',
    expiresAt: 'string | null',
    remainingTimeSeconds: 'number',
  }),
  questions: Object.freeze({
    question_id: 'number',
    question_text: 'string',
    marks: 'number',
    options: Object.freeze({ option_id: 'number', option_text: 'string' }),
  }),
  savedAnswers: Object.freeze({
    question_id: 'number',
    selected_option_id: 'number | null',
  }),
});
