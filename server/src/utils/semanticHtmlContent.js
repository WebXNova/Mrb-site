import sanitizeHtml from 'sanitize-html';
import { sanitizeQuestionHtml } from './questionHtmlSanitizer.js';
import { createStripHtmlOptions } from './sanitizeHtmlPolicy.js';

/**
 * Unicode characters that carry no visible meaning in question stems / choices.
 * Includes nbsp, zero-width spaces, and BOM.
 */
const INVISIBLE_CHARS = /[\u00a0\u200b\u200c\u200d\u2060\ufeff]/g;

/**
 * Strip HTML tags and normalize whitespace to obtain visible text for validation.
 * Does not mutate stored HTML — use only for emptiness / comparability checks.
 *
 * @param {unknown} html
 * @param {{ sanitize?: boolean }} [options]
 *   When `sanitize` is true (default), runs questionHtmlSanitizer first.
 * @returns {string}
 */
export function extractVisibleTextFromHtml(html, { sanitize = true } = {}) {
  const source = sanitize ? sanitizeQuestionHtml(html) : String(html ?? '');
  return sanitizeHtml(source, createStripHtmlOptions())
    .replace(INVISIBLE_CHARS, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * True when HTML has no meaningful visible text after tag stripping.
 *
 * @param {unknown} html
 * @param {{ sanitize?: boolean }} [options]
 */
export function isSemanticallyEmptyHtml(html, options = {}) {
  return extractVisibleTextFromHtml(html, options).length === 0;
}

/**
 * Normalized comparable plain text for duplicate detection (case-insensitive).
 *
 * @param {unknown} html
 * @param {{ sanitize?: boolean }} [options]
 */
export function normalizeComparableHtmlText(html, options = {}) {
  return extractVisibleTextFromHtml(html, options).toLowerCase();
}
