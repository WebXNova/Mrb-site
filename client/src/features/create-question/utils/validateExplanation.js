import { MAX_QUESTION_EXPLANATION_LENGTH } from '../../../admin/constants/questionBank.constants.js';
import { sanitizeExplanationHtml } from './sanitizeExplanationHtml.js';

/**
 * Explanation validation — pre-submit gate for optional MCQ solution text.
 *
 * Security:
 * - Editor output is NEVER trusted
 * - Unsafe content is rejected (not silently repaired on submit)
 * - Sanitization must produce safe HTML before persistence
 * - Backend re-validates on write
 */

/** @typedef {{
 *   ok: true,
 *   sanitizedHtml: string|null,
 *   isEmpty: boolean,
 * }} ExplanationValidationSuccess */

/** @typedef {{
 *   ok: false,
 *   code: string,
 *   message: string,
 *   detail?: string,
 * }} ExplanationValidationFailure */

const UNSAFE_CONTENT_CHECKS = [
  { pattern: /<script\b/i, detail: 'SCRIPT_TAG' },
  { pattern: /<iframe\b/i, detail: 'IFRAME_TAG' },
  { pattern: /<svg\b/i, detail: 'SVG_TAG' },
  { pattern: /<object\b/i, detail: 'OBJECT_TAG' },
  { pattern: /<embed\b/i, detail: 'EMBED_TAG' },
  { pattern: /javascript:/i, detail: 'JAVASCRIPT_URL' },
  { pattern: /data:/i, detail: 'DATA_URL' },
  { pattern: /vbscript:/i, detail: 'VBSCRIPT_URL' },
  { pattern: /\son[a-z]+\s*=/i, detail: 'INLINE_EVENT_HANDLER' },
];

/**
 * Detect executable or dangerous markup in untrusted explanation HTML.
 *
 * @param {unknown} html
 * @returns {{ unsafe: false } | { unsafe: true, detail: string }}
 */
export function detectUnsafeExplanationContent(html) {
  const raw = String(html ?? '');
  for (const check of UNSAFE_CONTENT_CHECKS) {
    if (check.pattern.test(raw)) {
      return { unsafe: true, detail: check.detail };
    }
  }
  return { unsafe: false };
}

/**
 * Validate explanation content before submission.
 *
 * Rules:
 * - null / undefined → allowed (optional field)
 * - empty string → allowed
 * - non-string → rejected
 * - over max length → rejected
 * - executable content → rejected
 * - must survive sanitizeExplanationHtml without unsafe remnants
 *
 * @param {unknown} raw
 * @param {{ maxLength?: number }} [config]
 * @returns {ExplanationValidationSuccess | ExplanationValidationFailure}
 */
export function validateExplanation(raw, { maxLength = MAX_QUESTION_EXPLANATION_LENGTH } = {}) {
  if (raw == null) {
    return { ok: true, sanitizedHtml: null, isEmpty: true };
  }

  if (typeof raw !== 'string') {
    return {
      ok: false,
      code: 'EXPLANATION_INVALID_TYPE',
      message: 'Explanation must be a string.',
    };
  }

  const trimmed = raw.trim();
  if (trimmed === '') {
    return { ok: true, sanitizedHtml: '', isEmpty: true };
  }

  if (trimmed.length > maxLength) {
    return {
      ok: false,
      code: 'EXPLANATION_TOO_LONG',
      message: `Explanation must not exceed ${maxLength} characters.`,
      detail: String(trimmed.length),
    };
  }

  const unsafeInput = detectUnsafeExplanationContent(trimmed);
  if (unsafeInput.unsafe) {
    return {
      ok: false,
      code: 'EXPLANATION_UNSAFE_CONTENT',
      message: 'Explanation contains disallowed executable or unsafe content.',
      detail: unsafeInput.detail,
    };
  }

  const sanitizedHtml = sanitizeExplanationHtml(trimmed);

  if (sanitizedHtml.length > maxLength) {
    return {
      ok: false,
      code: 'EXPLANATION_TOO_LONG',
      message: `Explanation must not exceed ${maxLength} characters after sanitization.`,
      detail: String(sanitizedHtml.length),
    };
  }

  const unsafeOutput = detectUnsafeExplanationContent(sanitizedHtml);
  if (unsafeOutput.unsafe) {
    return {
      ok: false,
      code: 'EXPLANATION_SANITIZATION_FAILED',
      message: 'Explanation could not be sanitized to a safe format.',
      detail: unsafeOutput.detail,
    };
  }

  return {
    ok: true,
    sanitizedHtml,
    isEmpty: sanitizedHtml.trim() === '',
  };
}

/**
 * Map validation failure to a single UI error string.
 *
 * @param {ExplanationValidationFailure} failure
 * @returns {string}
 */
export function explanationValidationMessage(failure) {
  if (failure.ok) return '';
  return failure.message;
}
