import { receiptMediaUrl } from '../../utils/mediaUrl.js';

const BLOCKED_PROTOCOL_PATTERN = /^(javascript|data|file|ftp|blob|mailto|vbscript):/i;
const UPLOAD_PATH_PATTERN = /^\/api\/uploads\/question-bank\/[a-f0-9]{48}\.(jpg|png|webp)$/i;
const HTTP_URL_PATTERN = /^https?:\/\/.+/i;

/**
 * @param {string} raw
 * @returns {{ ok: true, url: string } | { ok: false, message: string }}
 */
export function validateQuestionImageUrl(raw) {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) {
    return { ok: false, message: 'Image URL is required.' };
  }
  if (BLOCKED_PROTOCOL_PATTERN.test(trimmed)) {
    return { ok: false, message: 'Only http:// or https:// image URLs are allowed.' };
  }
  if (trimmed.includes('..') || /[\s<>"']/.test(trimmed)) {
    return { ok: false, message: 'Image URL contains invalid characters.' };
  }

  if (trimmed.startsWith('/')) {
    if (!UPLOAD_PATH_PATTERN.test(trimmed)) {
      return { ok: false, message: 'Uploaded image path is not valid.' };
    }
    return { ok: true, url: trimmed };
  }

  if (!HTTP_URL_PATTERN.test(trimmed)) {
    return { ok: false, message: 'URL must start with http:// or https://.' };
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { ok: false, message: 'Only http:// or https:// image URLs are allowed.' };
    }
    return { ok: true, url: parsed.href };
  } catch {
    return { ok: false, message: 'Enter a valid image URL.' };
  }
}

/**
 * Safe src for <img> preview — http(s) or validated upload path only.
 * @param {string} raw
 * @returns {string}
 */
export function sanitizeQuestionImagePreviewUrl(raw) {
  const result = validateQuestionImageUrl(raw);
  if (!result.ok) return '';
  if (result.url.startsWith('/')) {
    return receiptMediaUrl(result.url);
  }
  return result.url;
}
