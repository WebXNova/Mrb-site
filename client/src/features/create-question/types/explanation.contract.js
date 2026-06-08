/**
 * @file Explanation data contract — Question Bank LMS.
 *
 * Storage column: question_bank.explanation (LONGTEXT NULL)
 * Format version: html_v1 (sanitized HTML string; null when omitted)
 *
 * Future: envelope fields (format, meta) can be added without breaking v1 reads.
 */

/** @typedef {'html_v1'} ExplanationFormat */

/**
 * Authoring state — controlled editor slice (Create Question reducer).
 *
 * @typedef {Object} ExplanationAuthoringState
 * @property {string} textHtmlDraft — sanitized HTML from CKEditor (never raw)
 * @property {string} textPlain — derived plain text for preview/search hints
 */

/**
 * Client submit slice — after validateExplanation + sanitization.
 *
 * @typedef {Object} ExplanationSubmitSlice
 * @property {string|null} html — sanitized HTML; null when optional field omitted
 * @property {string} plainText — derived plain text (empty when omitted)
 * @property {boolean} isEmpty — true when teacher left explanation blank
 * @property {ExplanationFormat} format
 */

/**
 * API write field — POST/PUT question body (snake_case).
 * Maps 1:1 to question_bank.explanation.
 *
 * @typedef {string|null} ExplanationApiWriteField
 */

/**
 * API read model — GET question / attempt result when show_explanations enabled.
 *
 * @typedef {Object} ExplanationReadDto
 * @property {string|null} html — sanitized HTML from server
 * @property {string|null} plainText — server- or client-derived plain text
 * @property {boolean} hasContent
 * @property {ExplanationFormat} format
 * @property {number} charCount — analytics: HTML character length
 * @property {ExplanationAnalyticsMeta} meta
 */

/**
 * Analytics-friendly metadata (derived, not stored in v1).
 *
 * @typedef {Object} ExplanationAnalyticsMeta
 * @property {number} charCount
 * @property {number} plainTextLength
 * @property {boolean} hasTables
 * @property {boolean} hasLists
 * @property {boolean} hasFormatting — bold/italic/underline/sub/sup
 */

export const EXPLANATION_FORMAT_VERSION = 1;
export const EXPLANATION_FORMAT = /** @type {ExplanationFormat} */ ('html_v1');

/**
 * @param {string|null|undefined} html
 * @returns {ExplanationAnalyticsMeta}
 */
export function deriveExplanationAnalytics(html) {
  const safe = String(html ?? '');
  const plain = safe.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

  return {
    charCount: safe.length,
    plainTextLength: plain.length,
    hasTables: /<table\b/i.test(safe),
    hasLists: /<[uo]l\b/i.test(safe),
    hasFormatting: /<(strong|b|em|i|u|sub|sup)\b/i.test(safe),
  };
}

/**
 * Build read DTO from DB/API value (question_bank.explanation).
 *
 * @param {string|null|undefined} dbValue
 * @returns {ExplanationReadDto}
 */
export function explanationFromStorage(dbValue) {
  const html = dbValue == null || String(dbValue).trim() === '' ? null : String(dbValue);
  const meta = deriveExplanationAnalytics(html);
  const plainText = html ? html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : null;

  return {
    html,
    plainText: plainText || null,
    hasContent: Boolean(html),
    format: EXPLANATION_FORMAT,
    charCount: meta.charCount,
    meta,
  };
}

/**
 * Map validated submit slice to API write field (null when empty).
 *
 * @param {{ sanitizedHtml?: string|null, isEmpty?: boolean } | null} validationResult
 * @returns {ExplanationApiWriteField}
 */
export function toExplanationApiField(validationResult) {
  if (!validationResult || validationResult.isEmpty) {
    return null;
  }
  const html = validationResult.sanitizedHtml;
  if (html == null || String(html).trim() === '') {
    return null;
  }
  return String(html);
}

/**
 * Build submit slice from pipeline output.
 *
 * @param {string|null} html
 * @param {string} plainText
 * @param {boolean} isEmpty
 * @returns {ExplanationSubmitSlice}
 */
export function buildExplanationSubmitSlice(html, plainText, isEmpty) {
  return {
    html: isEmpty ? null : html,
    plainText: plainText ?? '',
    isEmpty,
    format: EXPLANATION_FORMAT,
  };
}
