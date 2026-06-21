import { sanitizeQuestionHtml } from './questionHtmlSanitizer.js';

/**
 * Sanitize rich HTML returned to students (attempt load, results, grading review).
 * Delegates to the question-bank allowlist — never use a weaker parallel policy.
 *
 * @param {string} value
 * @returns {string}
 */
export function sanitizeRichHtml(value) {
  return sanitizeQuestionHtml(value);
}
