import sanitizeHtml from 'sanitize-html';
import { createStripHtmlOptions } from './sanitizeHtmlPolicy.js';

/**
 * Strip all HTML and normalize whitespace for plain-text storage fields.
 * @param {unknown} value
 * @param {{ maxLength?: number }} [options]
 */
export function sanitizePlainText(value, { maxLength } = {}) {
  const stripped = sanitizeHtml(String(value ?? ''), createStripHtmlOptions())
    .replace(/\s+/g, ' ')
    .trim();

  if (maxLength != null && stripped.length > maxLength) {
    return stripped.slice(0, maxLength);
  }
  return stripped;
}
