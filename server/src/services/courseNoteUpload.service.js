import { createHash, randomBytes } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { UploadRejectedError } from '../errors/media/MediaErrors.js';
import { reencodeValidatedRasterImage } from '../utils/rasterImageReencode.js';
import {
  contentTypeForNoteFileType,
  validateSecureNoteFileUpload,
} from '../utils/secureNoteFileValidation.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const COURSE_NOTES_UPLOAD_NAMESPACE = 'course-notes';
export const COURSE_NOTES_UPLOAD_MAX_BYTES = 100 * 1024 * 1024;
export const COURSE_NOTES_UPLOAD_DIR = path.resolve(__dirname, '../../uploads/course-notes');

/**
 * @param {string} filename
 */
export function buildCourseNoteFileUrl(filename) {
  const base = path.basename(String(filename || ''));
  if (!base || base !== filename || base.includes('..') || /[\\/]/.test(base)) {
    throw new UploadRejectedError('Invalid generated filename.');
  }
  return `/uploads/course-notes/${base}`;
}

export async function ensureCourseNotesUploadDir() {
  await fs.mkdir(COURSE_NOTES_UPLOAD_DIR, { recursive: true });
}

export function generateCourseNoteTempFilename() {
  return `${randomBytes(24).toString('hex')}.upload`;
}

/**
 * @param {string} filePath
 */
export async function hashUploadedFileSha256(filePath) {
  const buf = await fs.readFile(filePath);
  return createHash('sha256').update(buf).digest('hex');
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
 * Validate magic bytes, store with server-generated filename.
 *
 * @param {{ filePath: string, originalName: string, claimedMime: string, size: number }} input
 * @returns {Promise<{ url: string, filename: string, fileType: 'pdf'|'image'|'docx', fileSize: number, sha256: string }>}
 */
export async function finalizeCourseNoteUpload(input) {
  const { filePath, originalName, claimedMime, size } = input;

  let sha256;
  try {
    sha256 = await hashUploadedFileSha256(filePath);
  } catch {
    await safeUnlink(filePath);
    throw new UploadRejectedError('Could not read uploaded file.');
  }

  let validation;
  try {
    validation = validateSecureNoteFileUpload({
      filePath,
      originalName,
      claimedMime,
      size,
      maxBytes: COURSE_NOTES_UPLOAD_MAX_BYTES,
    });
  } catch (error) {
    await safeUnlink(filePath);
    throw new UploadRejectedError(error?.message || 'Upload was rejected.');
  }

  const finalName = `${randomBytes(24).toString('hex')}${validation.extension}`;
  const finalPath = path.join(COURSE_NOTES_UPLOAD_DIR, finalName);
  const namespacePrefix = `${COURSE_NOTES_UPLOAD_DIR}${path.sep}`;
  if (!finalPath.startsWith(namespacePrefix)) {
    await safeUnlink(filePath);
    throw new UploadRejectedError('Invalid storage path.');
  }

  let storedSize = 0;

  try {
    if (validation.fileType === 'image') {
      const outputBuffer = await reencodeValidatedRasterImage(filePath, validation.kind);
      if (outputBuffer.length > COURSE_NOTES_UPLOAD_MAX_BYTES) {
        throw new UploadRejectedError('File must be 100 MB or smaller.');
      }
      await fs.writeFile(finalPath, outputBuffer, { flag: 'wx' });
      storedSize = outputBuffer.length;
    } else {
      const raw = await fs.readFile(filePath);
      if (raw.length > COURSE_NOTES_UPLOAD_MAX_BYTES) {
        throw new UploadRejectedError('File must be 100 MB or smaller.');
      }
      await fs.writeFile(finalPath, raw, { flag: 'wx' });
      storedSize = raw.length;
    }
  } catch (error) {
    await safeUnlink(finalPath);
    if (error instanceof UploadRejectedError) throw error;
    throw new UploadRejectedError(error?.message || 'Upload was rejected.');
  } finally {
    await safeUnlink(filePath);
  }

  return {
    url: buildCourseNoteFileUrl(finalName),
    filename: finalName,
    fileType: validation.fileType,
    fileSize: storedSize,
    sha256,
    contentType: contentTypeForNoteFileType(validation.fileType, finalName),
  };
}

export { contentTypeForNoteFileType };
