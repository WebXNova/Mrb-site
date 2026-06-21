import { sanitizeEditorOutput } from '../sanitizeEditorOutput.js';
import { toSafePreviewText } from '../previewText.js';
import { validateImageUrl } from '../image/validateImageUrl.js';
import { FORMULA_PATTERN } from '../formula/formulaDelimiters.js';

const MAX_QUESTION_HTML_LENGTH = 50_000;

/**
 * @typedef {Object} QuestionContentValidation
 * @property {boolean} ok
 * @property {string} sanitizedHtml
 * @property {string} plainText
 * @property {Array<{ code: string, message: string }>} errors
 * @property {Array<{ code: string, message: string }>} warnings
 */

/**
 * Validate question stem content after sanitization.
 * Editor output is never trusted — always run through this before preview/submit.
 *
 * @param {string} rawHtml
 * @returns {QuestionContentValidation}
 */
export function validateQuestionContent(rawHtml) {
  const errors = /** @type {Array<{ code: string, message: string }>} */ ([]);
  const warnings = /** @type {Array<{ code: string, message: string }>} */ ([]);

  const sanitizedHtml = sanitizeEditorOutput(rawHtml);

  if (sanitizedHtml.length > MAX_QUESTION_HTML_LENGTH) {
    errors.push({
      code: 'QUESTION_TOO_LONG',
      message: `Question content exceeds ${MAX_QUESTION_HTML_LENGTH} characters.`,
    });
  }

  const plainText = toSafePreviewText(sanitizedHtml);
  const hasFormula = /⟦([^⟧]{1,500})⟧/.test(plainText);
  const hasImage = /<img\b/i.test(sanitizedHtml);
  const hasText = plainText.replace(FORMULA_PATTERN, '').trim().length > 0;

  if (!hasText && !hasImage && !hasFormula) {
    errors.push({
      code: 'QUESTION_EMPTY',
      message: 'Question text, image, or formula is required.',
    });
  }

  const imgSrcPattern = /<img[^>]+src\s*=\s*["']([^"']+)["']/gi;
  let imgMatch;
  while ((imgMatch = imgSrcPattern.exec(sanitizedHtml)) !== null) {
    const check = validateImageUrl(imgMatch[1], { allowEmpty: true });
    if (!check.ok) {
      errors.push({
        code: 'QUESTION_IMAGE_INVALID',
        message: check.message,
      });
    }
  }

  if (/<script|javascript:|on\w+\s*=/i.test(sanitizedHtml)) {
    errors.push({
      code: 'QUESTION_UNSAFE_CONTENT',
      message: 'Question contains disallowed content.',
    });
  }

  return {
    ok: errors.length === 0,
    sanitizedHtml,
    plainText,
    errors,
    warnings,
  };
}
