import { toSafePreviewText } from './previewText.js';

/**
 * Prepare sanitized HTML for the preview system.
 * All HTML must pass sanitization before preview/render.
 * Returns plain text only — preview must never execute raw HTML.
 *
 * @param {string} cleanHtml — output from sanitizeEditorOutput()
 * @returns {string}
 */
export function prepareForPreview(cleanHtml) {
  return toSafePreviewText(cleanHtml);
}
