import { sanitizePlainText as stripPlainText } from '../../security/sanitizePlainText.js';

/**
 * Strip HTML and normalize whitespace for safe plain-text display.
 * Server stores plain text today; this guards against future rich text or XSS in stored data.
 */
export function sanitizeQuestionPlainText(raw) {
  return stripPlainText(raw);
}

/**
 * @param {string} url
 * @returns {string|null}
 */
export function sanitizeQuestionAttachmentUrl(url) {
  const value = String(url ?? '').trim();
  if (!value.startsWith('/api/uploads/student-qa/')) return null;
  if (value.includes('..')) return null;
  if (!/^\/api\/uploads\/student-qa\/[a-zA-Z0-9._-]+$/.test(value)) return null;
  return value;
}

/**
 * @param {string} url
 * @returns {string|null}
 */
export function sanitizeTeacherAnswerAttachmentUrl(url) {
  const value = String(url ?? '').trim();
  if (!value.startsWith('/api/uploads/teacher-qa/')) return null;
  if (value.includes('..')) return null;
  if (!/^\/api\/uploads\/teacher-qa\/[a-zA-Z0-9._-]+$/.test(value)) return null;
  return value;
}
