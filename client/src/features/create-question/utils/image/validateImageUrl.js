/**
 * Image URL validation for Question Bank.
 * Only validated URLs are allowed into application state.
 * Backend re-validation is mandatory.
 */

export const MAX_IMAGE_URL_LENGTH = 1000;

const BLOCKED_PROTOCOL_PATTERN = /^(javascript|data|file|ftp|blob|mailto|vbscript):/i;
const UPLOAD_PATH_PATTERN = /^\/api\/uploads\/question-bank\/[a-f0-9]{48}\.(jpg|png|webp)$/i;
const HTTP_URL_PATTERN = /^https?:\/\/.+/i;

/** Optional internal-only mode — set to hostname patterns when product requires it. */
export const INTERNAL_UPLOAD_PATH_ONLY = false;

/**
 * @param {string} raw
 * @param {{ allowEmpty?: boolean }} [options]
 * @returns {{ ok: true, url: string } | { ok: false, message: string, code: string }}
 */
export function validateImageUrl(raw, { allowEmpty = false } = {}) {
  const trimmed = String(raw ?? '').trim();

  if (!trimmed) {
    if (allowEmpty) {
      return { ok: true, url: '' };
    }
    return { ok: false, message: 'Image URL is required.', code: 'IMAGE_URL_REQUIRED' };
  }

  if (trimmed.length > MAX_IMAGE_URL_LENGTH) {
    return {
      ok: false,
      message: `Image URL must not exceed ${MAX_IMAGE_URL_LENGTH} characters.`,
      code: 'IMAGE_URL_TOO_LONG',
    };
  }

  if (BLOCKED_PROTOCOL_PATTERN.test(trimmed)) {
    return {
      ok: false,
      message: 'Only http:// or https:// image URLs are allowed.',
      code: 'IMAGE_URL_BLOCKED_PROTOCOL',
    };
  }

  if (/^data:image\//i.test(trimmed)) {
    return {
      ok: false,
      message: 'Base64 data URLs are not allowed.',
      code: 'IMAGE_URL_DATA_URI',
    };
  }

  if (trimmed.includes('..') || /[\s<>"']/.test(trimmed)) {
    return {
      ok: false,
      message: 'Image URL contains invalid characters.',
      code: 'IMAGE_URL_INVALID_CHARACTERS',
    };
  }

  if (trimmed.startsWith('/')) {
    if (!UPLOAD_PATH_PATTERN.test(trimmed)) {
      return {
        ok: false,
        message: 'Uploaded image path is not valid.',
        code: 'IMAGE_URL_INVALID_UPLOAD_PATH',
      };
    }
    return { ok: true, url: trimmed };
  }

  if (INTERNAL_UPLOAD_PATH_ONLY) {
    return {
      ok: false,
      message: 'Only uploaded question-bank image paths are allowed.',
      code: 'IMAGE_URL_EXTERNAL_BLOCKED',
    };
  }

  if (!HTTP_URL_PATTERN.test(trimmed)) {
    return {
      ok: false,
      message: 'URL must start with http:// or https://.',
      code: 'IMAGE_URL_INVALID_SCHEME',
    };
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return {
        ok: false,
        message: 'Only http:// or https:// image URLs are allowed.',
        code: 'IMAGE_URL_BLOCKED_PROTOCOL',
      };
    }
    if (parsed.username || parsed.password) {
      return {
        ok: false,
        message: 'Image URL must not contain credentials.',
        code: 'IMAGE_URL_CREDENTIALS',
      };
    }
    return { ok: true, url: parsed.href };
  } catch {
    return { ok: false, message: 'Enter a valid image URL.', code: 'IMAGE_URL_MALFORMED' };
  }
}
