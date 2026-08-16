import { createHash, randomBytes } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { UploadRejectedError } from '../errors/media/MediaErrors.js';
import { validateSecureRasterImageUpload } from '../utils/secureRasterImageValidation.js';
import { reencodeValidatedRasterImage } from '../utils/rasterImageReencode.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

/**
 * Validate magic bytes, reject WebP, re-encode, write random filename.
 *
 * @param {{ filePath: string, originalName: string, claimedMime: string, size: number }} input
 * @returns {Promise<{ url: string, filename: string, kind: string, sha256: string }>}
 */
export async function finalizeManualPaymentScreenshot(input) {
  const { filePath, originalName, claimedMime, size } = input;

  let sha256;
  try {
    sha256 = await hashUploadedFileSha256(filePath);
  } catch {
    await safeUnlink(filePath);
    throw new UploadRejectedError('Could not read uploaded screenshot.');
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
    await safeUnlink(filePath);
    throw new UploadRejectedError(error?.message || 'Screenshot was rejected.');
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
    await safeUnlink(filePath);
    throw new UploadRejectedError(error?.message || 'Screenshot was rejected.');
  } finally {
    await safeUnlink(filePath);
  }

  if (outputBuffer.length > MANUAL_PAYMENT_UPLOAD_MAX_BYTES) {
    throw new UploadRejectedError('Screenshot must be 5 MB or smaller.');
  }

  try {
    await fs.writeFile(finalPath, outputBuffer, { flag: 'wx' });
  } catch {
    await safeUnlink(finalPath);
    throw new UploadRejectedError('Failed to store screenshot.');
  }

  return {
    url: buildManualPaymentScreenshotUrl(finalName),
    filename: finalName,
    kind: validation.kind,
    sha256,
  };
}
