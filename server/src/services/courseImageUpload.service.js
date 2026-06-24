import { randomBytes } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { UploadRejectedError } from '../errors/media/MediaErrors.js';
import { logActivity } from './activityLog.service.js';
import { validateSecureRasterImageUpload } from '../utils/secureRasterImageValidation.js';
import { reencodeValidatedRasterImage } from '../utils/rasterImageReencode.js';
import { getClientIp } from '../utils/network.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const COURSE_UPLOAD_NAMESPACE = 'courses';
export const COURSE_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
export const COURSE_UPLOAD_DIR = path.resolve(__dirname, '../../uploads/courses');

const LOG_PREFIX = '[course-image-upload]';

/**
 * @param {import('express').Request} req
 * @param {string} action
 * @param {Record<string, unknown>} [metadata]
 */
async function logUploadEvent(req, action, metadata = {}) {
  try {
    await logActivity({
      userId: req.user?.id ?? null,
      role: req.user?.role ?? 'system',
      action,
      entityType: 'course_image_upload',
      metadata: {
        path: req.originalUrl || req.path,
        ipAddress: getClientIp(req),
        namespace: COURSE_UPLOAD_NAMESPACE,
        ...metadata,
      },
    });
  } catch (error) {
    console.warn(`${LOG_PREFIX} audit log failed`, error?.message || error);
  }
}

export async function ensureCourseUploadDir() {
  await fs.mkdir(COURSE_UPLOAD_DIR, { recursive: true });
}

/**
 * Cryptographically random temp filename — final extension applied after validation.
 */
export function generateCourseTempUploadFilename() {
  return `${randomBytes(24).toString('hex')}.upload`;
}

/**
 * @param {string} filename
 */
export function buildCourseImageUrl(filename) {
  const base = path.basename(String(filename || ''));
  if (!base || base !== filename || base.includes('..') || /[\\/]/.test(base)) {
    throw new UploadRejectedError('Invalid generated filename.');
  }
  return `/api/uploads/${COURSE_UPLOAD_NAMESPACE}/${base}`;
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
 * @param {import('express').Request} req
 * @param {{ filePath: string, originalName: string, claimedMime: string, size: number }} input
 */
export async function finalizeCourseImageUpload(req, input) {
  const { filePath, originalName, claimedMime, size } = input;

  let validation;
  try {
    validation = validateSecureRasterImageUpload({
      filePath,
      originalName,
      claimedMime,
      size,
      maxBytes: COURSE_UPLOAD_MAX_BYTES,
    });
  } catch (error) {
    await safeUnlink(filePath);
    await logUploadEvent(req, 'admin.course.upload.validation_failed', {
      reason: error?.code || 'validation_failed',
      message: error?.message,
      originalName: path.basename(originalName || ''),
      claimedMime,
    });
    console.warn(`${LOG_PREFIX} validation failed`, {
      userId: req.user?.id,
      reason: error?.code,
      message: error?.message,
    });
    throw new UploadRejectedError(error?.message || 'Upload was rejected.');
  }

  if (validation.mimeMismatch) {
    await logUploadEvent(req, 'admin.course.upload.mime_mismatch', {
      claimedMime,
      detectedKind: validation.kind,
      originalName: path.basename(originalName || ''),
    });
    console.warn(`${LOG_PREFIX} client MIME mismatch (accepted via signature)`, {
      userId: req.user?.id,
      claimedMime,
      kind: validation.kind,
    });
  }

  const finalName = `${randomBytes(24).toString('hex')}${validation.extension}`;
  const finalPath = path.join(COURSE_UPLOAD_DIR, finalName);
  const namespacePrefix = `${COURSE_UPLOAD_DIR}${path.sep}`;

  if (!finalPath.startsWith(namespacePrefix)) {
    await safeUnlink(filePath);
    throw new UploadRejectedError('Invalid storage path.');
  }

  let outputBuffer;
  try {
    outputBuffer = await reencodeValidatedRasterImage(filePath, validation.kind);
  } catch (error) {
    await safeUnlink(filePath);
    await logUploadEvent(req, 'admin.course.upload.validation_failed', {
      reason: error?.code || 'reencode_failed',
      message: error?.message,
      originalName: path.basename(originalName || ''),
      claimedMime,
    });
    console.warn(`${LOG_PREFIX} re-encode failed`, {
      userId: req.user?.id,
      reason: error?.code,
      message: error?.message,
    });
    throw new UploadRejectedError(error?.message || 'Upload was rejected.');
  } finally {
    await safeUnlink(filePath);
  }

  if (outputBuffer.length > COURSE_UPLOAD_MAX_BYTES) {
    await safeUnlink(finalPath);
    await logUploadEvent(req, 'admin.course.upload.validation_failed', {
      reason: 'reencoded_too_large',
      size: outputBuffer.length,
      maxBytes: COURSE_UPLOAD_MAX_BYTES,
    });
    throw new UploadRejectedError('Image must be 2 MB or smaller.');
  }

  try {
    await fs.writeFile(finalPath, outputBuffer, { flag: 'wx' });
  } catch (error) {
    await safeUnlink(finalPath);
    await logUploadEvent(req, 'admin.course.upload.failed', {
      reason: 'write_failed',
      message: error?.message,
    });
    console.error(`${LOG_PREFIX} write failed`, error?.message || error);
    throw new UploadRejectedError('Failed to store uploaded image.');
  }

  const url = buildCourseImageUrl(finalName);
  await logUploadEvent(req, 'admin.course.upload.success', {
    filename: finalName,
    kind: validation.kind,
    size: outputBuffer.length,
    originalSize: size,
  });

  return { url, kind: validation.kind, filename: finalName };
}
