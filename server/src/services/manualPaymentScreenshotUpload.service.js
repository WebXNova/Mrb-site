import { createHash, randomBytes } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { UploadRejectedError } from '../errors/media/MediaErrors.js';
import { validateSecureRasterImageUpload } from '../utils/secureRasterImageValidation.js';
import { reencodeValidatedRasterImage } from '../utils/rasterImageReencode.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_PREFIX = '[manual-payment-screenshot]';

export const MANUAL_PAYMENT_UPLOAD_NAMESPACE = 'manual-payments';
export const MANUAL_PAYMENT_UPLOAD_MAX_BYTES = 5 * 1024 * 1024;
export const MANUAL_PAYMENT_UPLOAD_DIR = path.resolve(__dirname, '../../uploads/manual-payments');
export const MANUAL_PAYMENT_ALLOWED_KINDS = Object.freeze(new Set(['jpeg', 'png']));

/**
 * SHA-256 of original uploaded bytes (before re-encode).
 * @param {string} filePath
 * @returns {Promise<string>}
 */
export async function hashUploadedFileSha256(filePath) {
  const buf = await fs.readFile(filePath);
  return createHash('sha256').update(buf).digest('hex');
}

export async function ensureManualPaymentUploadDir() {
  await fs.mkdir(MANUAL_PAYMENT_UPLOAD_DIR, { recursive: true });
}

export function generateManualPaymentTempFilename() {
  return `${randomBytes(24).toString('hex')}.upload`;
}

/**
 * @param {string} filename
 */
export function buildManualPaymentScreenshotUrl(filename) {
  const base = path.basename(String(filename || ''));
  if (!base || base !== filename || base.includes('..') || /[\\/]/.test(base)) {
    throw new UploadRejectedError('Invalid generated filename.');
  }
  return `/api/uploads/${MANUAL_PAYMENT_UPLOAD_NAMESPACE}/${base}`;
}

const STORED_SCREENSHOT_NAME_RE = /^[a-f0-9]{48}\.(jpg|jpeg|png)$/i;

/**
 * Basename-only, path-traversal safe. Returns null if the stored URL is not a local screenshot.
 * @param {string} screenshotUrl
 * @returns {string|null}
 */
export function resolveStoredScreenshotFilename(screenshotUrl) {
  const base = path.basename(String(screenshotUrl || '').split('?')[0]);
  if (!STORED_SCREENSHOT_NAME_RE.test(base)) return null;
  return base;
}

/**
 * Multer originalname may be empty or extensionless on mobile. Infer from MIME when needed.
 * @param {{ originalname?: string, mimetype?: string } | null | undefined} file
 * @returns {string}
 */
export function resolveManualPaymentScreenshotOriginalName(file) {
  const raw = path.basename(String(file?.originalname || '').split('?')[0]);
  if (raw && !raw.includes('..') && !/[\\/]/.test(raw)) {
    const ext = path.extname(raw).toLowerCase();
    if (ext === '.jpg' || ext === '.jpeg' || ext === '.png') return raw;
  }
  const mime = String(file?.mimetype || '').toLowerCase();
  if (mime === 'image/png') return 'screenshot.png';
  if (mime === 'image/jpeg' || mime === 'image/jpg') return 'screenshot.jpg';
  return raw || 'screenshot.bin';
}

/**
 * Map a multer disk file to the finalize() contract. Do not pass `req.file` through unchanged —
 * multer uses `path` / `originalname` / `mimetype`, not `filePath` / `originalName` / `claimedMime`.
 *
 * @param {{ path?: string, originalname?: string, mimetype?: string, size?: number } | null | undefined} file
 * @returns {{ filePath: string, originalName: string, claimedMime: string, size: number }}
 */
export function mapMulterFileToScreenshotInput(file) {
  if (!file || typeof file !== 'object') {
    throw new UploadRejectedError('Screenshot is required.');
  }
  const filePath = String(file.path || '').trim();
  if (!filePath) {
    console.error(LOG_PREFIX, 'multer file missing path', {
      originalName: file.originalname || null,
      mime: file.mimetype || null,
      size: file.size ?? null,
    });
    throw new UploadRejectedError('Screenshot upload failed. Please try again.');
  }
  return {
    filePath,
    originalName: resolveManualPaymentScreenshotOriginalName(file),
    claimedMime: String(file.mimetype || ''),
    size: Number(file.size) || 0,
  };
}

/**
 * @param {string} filePath
 */
export async function safeUnlink(filePath) {
  if (!filePath) return;
  try {
    await fs.unlink(filePath);
  } catch {
    /* ignore */
  }
}

function logScreenshotFailure(stage, details, error) {
  console.error(LOG_PREFIX, stage, {
    originalName: details.originalName || null,
    size: details.size ?? null,
    mime: details.claimedMime || null,
    code: error?.code || null,
    message: error?.message || String(error || ''),
  });
}

function studentScreenshotRejectionMessage(error) {
  const code = error?.code;
  if (code === 'FILE_TOO_LARGE') return 'Screenshot must be 5 MB or smaller.';
  if (
    code === 'BLOCKED_EXTENSION' ||
    code === 'INVALID_SIGNATURE' ||
    code === 'EXTENSION_SIGNATURE_MISMATCH' ||
    code === 'INVALID_KIND' ||
    code === 'INVALID_IMAGE_DECODE' ||
    code === 'INVALID_IMAGE_REENCODE'
  ) {
    return 'Screenshot must be a JPG or PNG image.';
  }
  if (code === 'IMAGE_DIMENSIONS_EXCEEDED') {
    return 'Screenshot image dimensions are too large.';
  }
  if (code === 'POLYGLOT_REJECTED') {
    return 'Screenshot was rejected.';
  }
  const msg = String(error?.message || '').trim();
  return msg || 'Screenshot was rejected.';
}

/**
 * Validate magic bytes, reject WebP, re-encode, write random filename.
 *
 * @param {{ filePath: string, originalName: string, claimedMime: string, size: number }} input
 * @returns {Promise<{ url: string, filename: string, kind: string, sha256: string, storedPath: string }>}
 */
export async function finalizeManualPaymentScreenshot(input) {
  const filePath = String(input?.filePath || '').trim();
  const originalName = String(input?.originalName || '');
  const claimedMime = String(input?.claimedMime || '');
  const size = Number(input?.size);

  if (!filePath) {
    logScreenshotFailure('missing filePath', { originalName, claimedMime, size }, null);
    throw new UploadRejectedError('Screenshot upload failed. Please try again.');
  }

  if (!Number.isFinite(size) || size <= 0) {
    await safeUnlink(filePath);
    throw new UploadRejectedError('The selected file is empty. Choose another screenshot.');
  }

  if (size > MANUAL_PAYMENT_UPLOAD_MAX_BYTES) {
    await safeUnlink(filePath);
    throw new UploadRejectedError('Screenshot must be 5 MB or smaller.');
  }

  let sha256;
  try {
    sha256 = await hashUploadedFileSha256(filePath);
  } catch (error) {
    logScreenshotFailure('hash/read failed', { originalName, claimedMime, size }, error);
    await safeUnlink(filePath);
    throw new UploadRejectedError('Screenshot upload failed. Please try again.');
  }

  let validation;
  try {
    validation = validateSecureRasterImageUpload({
      filePath,
      originalName,
      claimedMime,
      size,
      maxBytes: MANUAL_PAYMENT_UPLOAD_MAX_BYTES,
    });
  } catch (error) {
    logScreenshotFailure('validation failed', { originalName, claimedMime, size }, error);
    await safeUnlink(filePath);
    throw new UploadRejectedError(studentScreenshotRejectionMessage(error));
  }

  if (!MANUAL_PAYMENT_ALLOWED_KINDS.has(validation.kind)) {
    await safeUnlink(filePath);
    throw new UploadRejectedError('Screenshot must be a JPG or PNG image.');
  }

  const finalName = `${randomBytes(24).toString('hex')}${validation.extension}`;
  const finalPath = path.join(MANUAL_PAYMENT_UPLOAD_DIR, finalName);
  const namespacePrefix = `${MANUAL_PAYMENT_UPLOAD_DIR}${path.sep}`;
  if (!finalPath.startsWith(namespacePrefix)) {
    await safeUnlink(filePath);
    throw new UploadRejectedError('Invalid storage path.');
  }

  let outputBuffer;
  try {
    outputBuffer = await reencodeValidatedRasterImage(filePath, validation.kind);
  } catch (error) {
    logScreenshotFailure('reencode failed', { originalName, claimedMime, size }, error);
    await safeUnlink(filePath);
    throw new UploadRejectedError(studentScreenshotRejectionMessage(error));
  } finally {
    await safeUnlink(filePath);
  }

  if (outputBuffer.length > MANUAL_PAYMENT_UPLOAD_MAX_BYTES) {
    throw new UploadRejectedError('Screenshot must be 5 MB or smaller.');
  }

  try {
    await fs.writeFile(finalPath, outputBuffer, { flag: 'wx' });
  } catch (error) {
    logScreenshotFailure('store failed', { originalName, claimedMime, size }, error);
    await safeUnlink(finalPath);
    throw new UploadRejectedError('Failed to store screenshot.');
  }

  return {
    url: buildManualPaymentScreenshotUrl(finalName),
    filename: finalName,
    kind: validation.kind,
    sha256,
    storedPath: finalPath,
  };
}
