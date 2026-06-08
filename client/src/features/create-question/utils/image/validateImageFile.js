/**
 * Client-side file validation before upload.
 * Files are never stored directly in state — validated only at upload time.
 * Backend re-validation is mandatory.
 */

export const MAX_IMAGE_FILE_BYTES = 5 * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const BLOCKED_EXTENSIONS = new Set(['.svg', '.gif', '.bmp', '.ico', '.avif', '.heic']);

const JPEG_MAGIC = [0xff, 0xd8, 0xff];
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const WEBP_RIFF = [0x52, 0x49, 0x46, 0x46];
const WEBP_TAG = [0x57, 0x45, 0x42, 0x50];

/**
 * @param {Uint8Array} bytes
 * @param {number[]} prefix
 */
function startsWithBytes(bytes, prefix) {
  if (bytes.length < prefix.length) return false;
  return prefix.every((byte, index) => bytes[index] === byte);
}

/**
 * Lightweight magic-byte probe (first 12 bytes).
 * @param {ArrayBuffer} buffer
 * @returns {'jpeg'|'png'|'webp'|null}
 */
export function detectImageKindFromBuffer(buffer) {
  const bytes = new Uint8Array(buffer.slice(0, 12));
  if (startsWithBytes(bytes, JPEG_MAGIC)) return 'jpeg';
  if (startsWithBytes(bytes, PNG_MAGIC)) return 'png';
  if (
    startsWithBytes(bytes, WEBP_RIFF) &&
    bytes.length >= 12 &&
    WEBP_TAG.every((byte, index) => bytes[8 + index] === byte)
  ) {
    return 'webp';
  }
  return null;
}

/**
 * @param {File} file
 * @returns {Promise<{ ok: true } | { ok: false, message: string, code: string }>}
 */
export async function validateImageFile(file) {
  if (!(file instanceof File)) {
    return { ok: false, message: 'No file selected.', code: 'FILE_MISSING' };
  }

  if (!file.size || file.size <= 0) {
    return { ok: false, message: 'File is empty or corrupted.', code: 'FILE_EMPTY' };
  }

  if (file.size > MAX_IMAGE_FILE_BYTES) {
    return { ok: false, message: 'Image must be 5 MB or smaller.', code: 'FILE_TOO_LARGE' };
  }

  const mime = String(file.type || '').toLowerCase();
  if (!ALLOWED_MIME_TYPES.has(mime)) {
    return {
      ok: false,
      message: 'Only JPEG, PNG, or WebP images are allowed.',
      code: 'FILE_TYPE_REJECTED',
    };
  }

  if (mime === 'image/svg+xml') {
    return { ok: false, message: 'SVG images are not allowed.', code: 'FILE_SVG_REJECTED' };
  }

  const name = String(file.name || '').toLowerCase();
  const ext = name.includes('.') ? `.${name.split('.').pop()}` : '';
  if (BLOCKED_EXTENSIONS.has(ext) || !ALLOWED_EXTENSIONS.has(ext)) {
    return {
      ok: false,
      message: 'File extension is not allowed.',
      code: 'FILE_EXTENSION_REJECTED',
    };
  }

  try {
    const header = await file.slice(0, 12).arrayBuffer();
    const kind = detectImageKindFromBuffer(header);
    if (!kind) {
      return {
        ok: false,
        message: 'File content is not a supported image format.',
        code: 'FILE_INVALID_SIGNATURE',
      };
    }
  } catch {
    return { ok: false, message: 'Unable to read file for validation.', code: 'FILE_READ_FAILED' };
  }

  return { ok: true };
}
