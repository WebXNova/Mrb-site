import { receiptMediaUrl } from '../../../../utils/mediaUrl.js';
import { validateImageUrl } from './validateImageUrl.js';
import { validateOptionImageUrl } from './validateOptionImageUrl.js';

/**
 * Resolve a validated image URL for safe <img src> preview.
 * Only validated URLs are allowed into application state.
 *
 * @param {string} raw
 * @returns {string} empty string when invalid
 */
export function resolveImagePreviewSrc(raw) {
  const result = validateImageUrl(raw, { allowEmpty: true });
  if (!result.ok || !result.url) return '';
  if (result.url.startsWith('/')) {
    return receiptMediaUrl(result.url);
  }
  return result.url;
}

/**
 * Resolve a validated option image URL for safe <img src> preview.
 *
 * @param {string} raw
 * @returns {string} empty string when invalid
 */
export function resolveOptionImagePreviewSrc(raw) {
  const result = validateOptionImageUrl(raw, { allowEmpty: true });
  if (!result.ok || !result.url) return '';
  if (result.url.startsWith('/')) {
    return receiptMediaUrl(result.url);
  }
  return result.url;
}
