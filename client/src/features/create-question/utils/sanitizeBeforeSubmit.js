import { sanitizeEditorOutput } from './sanitizeEditorOutput.js';

/**
 * Reserved pre-submit hook — defense-in-depth before API layer.
 * CKEditor output is NEVER trusted.
 * Backend will re-validate content again.
 *
 * @param {string} html
 * @returns {string}
 */
export function sanitizeBeforeSubmit(html) {
  return sanitizeEditorOutput(html);
}
