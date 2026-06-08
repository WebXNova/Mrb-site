import { toSafePreviewText } from '../previewText.js';

/**
 * Placeholder sanitization for option text before preview/submit layers.
 * Option state is not trusted until backend validation.
 *
 * @param {string} raw
 * @returns {string}
 */
export function sanitizeOptionText(raw) {
  return toSafePreviewText(raw);
}
