import { randomBytes } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { UploadRejectedError } from '../errors/media/MediaErrors.js';
import { QA_AUDIT_CATEGORIES } from '../constants/qaAudit.schema.js';
import { getQaImageUploadConfig } from '../config/qaImageUpload.config.js';
import { validateSecureRasterImageUpload } from '../utils/secureRasterImageValidation.js';
import { reencodeValidatedRasterImage } from '../utils/rasterImageReencode.js';
import { writeQaAuditEventFromReq } from './qaAuditLog.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsRoot = path.resolve(__dirname, '../../uploads');

/** @type {ReadonlySet<string>} */
export const QA_IMAGE_UPLOAD_NAMESPACES = new Set(['student-qa', 'teacher-qa']);

const AUDIT_ENTITY_BY_NAMESPACE = Object.freeze({
  'student-qa': 'student_qa_upload',
  'teacher-qa': 'teacher_qa_upload',
});

const AUDIT_ACTION_PREFIX = Object.freeze({
  'student-qa': 'student.question.upload',
  'teacher-qa': 'teacher.question.upload',
});

const LOG_PREFIX = '[qa-image-upload]';

/**
 * @param {string} namespace
 */
export function getQaImageUploadDir(namespace) {
  const ns = String(namespace || '').trim();
  if (!QA_IMAGE_UPLOAD_NAMESPACES.has(ns)) {
    throw new UploadRejectedError('Invalid upload namespace.');
  }
  return path.resolve(uploadsRoot, ns);
}

/**
 * @param {number|string} userId
 */
export function generateQaTempUploadFilename(userId) {
  const uid = String(userId ?? '').trim();
  if (!uid || !/^\d+$/.test(uid)) {
    throw new UploadRejectedError('Invalid upload identity.');
  }
  return `${uid}-${randomBytes(16).toString('hex')}.upload`;
}

/**
 * @param {string} namespace
 * @param {number|string} userId
 * @param {string} extension
 */
export function buildQaFinalFilename(namespace, userId, extension) {
  const ns = String(namespace || '').trim();
  if (!QA_IMAGE_UPLOAD_NAMESPACES.has(ns)) {
    throw new UploadRejectedError('Invalid upload namespace.');
  }
  const uid = String(userId ?? '').trim();
  if (!uid || !/^\d+$/.test(uid)) {
    throw new UploadRejectedError('Invalid upload identity.');
  }
  const ext = String(extension || '').toLowerCase();
  if (!/^\.(jpg|png|webp)$/.test(ext)) {
    throw new UploadRejectedError('Invalid generated extension.');
  }
  return `${uid}-${randomBytes(24).toString('hex')}${ext}`;
}

/**
 * @param {string} namespace
 * @param {string} filename
 */
export function buildQaImageUrl(namespace, filename) {
  const ns = String(namespace || '').trim();
  if (!QA_IMAGE_UPLOAD_NAMESPACES.has(ns)) {
    throw new UploadRejectedError('Invalid upload namespace.');
  }
  const base = path.basename(String(filename || ''));
  if (!base || base !== filename || base.includes('..') || /[\\/]/.test(base)) {
    throw new UploadRejectedError('Invalid generated filename.');
  }
  if (base.includes('-rec-')) {
    throw new UploadRejectedError('Invalid generated filename.');
  }
  return `/api/uploads/${ns}/${base}`;
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
 * @param {string} namespace
 * @param {string} actionSuffix
 * @param {Record<string, unknown>} metadata
 */
async function logQaUploadEvent(req, namespace, actionSuffix, metadata = {}) {
  const prefix = AUDIT_ACTION_PREFIX[namespace] || 'qa.upload';
  const entityType = AUDIT_ENTITY_BY_NAMESPACE[namespace] || 'qa_upload';
  const action = `${prefix}.${actionSuffix}`;
  const eventCategory =
    actionSuffix === 'success'
      ? QA_AUDIT_CATEGORIES.UPLOAD_ACCEPTED
      : QA_AUDIT_CATEGORIES.UPLOAD_REJECTED;

  await writeQaAuditEventFromReq(req, {
    role: req.user?.role ?? 'system',
    action,
    entityType,
    eventCategory,
    metadata: { namespace, ...metadata },
  });
}

/**
 * @param {string} namespace
 */
export async function ensureQaImageUploadDir(namespace) {
  const dir = getQaImageUploadDir(namespace);
  await fs.mkdir(dir, { recursive: true });
}

/**
 * Hardened finalize — mirrors question-bank pipeline with userId-prefixed filenames.
 *
 * @param {import('express').Request} req
 * @param {{ namespace: string, filePath: string, originalName: string, claimedMime: string, size: number }} input
 */
export async function finalizeQaImageUpload(req, input) {
  const { namespace, filePath, originalName, claimedMime, size } = input;
  const config = getQaImageUploadConfig();
  const uploadDir = getQaImageUploadDir(namespace);
  const userId = req.user?.id;

  let validation;
  try {
    validation = validateSecureRasterImageUpload({
      filePath,
      originalName,
      claimedMime,
      size,
      maxBytes: config.maxBytes,
    });
  } catch (error) {
    await safeUnlink(filePath);
    await logQaUploadEvent(req, namespace, 'validation_failed', {
      reason: error?.code || 'validation_failed',
      message: error?.message,
      originalName: path.basename(originalName || ''),
      claimedMime,
    });
    console.warn(`${LOG_PREFIX} validation failed`, {
      namespace,
      userId,
      reason: error?.code,
      message: error?.message,
    });
    throw new UploadRejectedError('Upload was rejected.');
  }

  if (validation.mimeMismatch) {
    await logQaUploadEvent(req, namespace, 'mime_mismatch', {
      claimedMime,
      detectedKind: validation.kind,
      originalName: path.basename(originalName || ''),
    });
    console.warn(`${LOG_PREFIX} client MIME mismatch (accepted via signature)`, {
      namespace,
      userId,
      claimedMime,
      kind: validation.kind,
    });
  }

  const finalName = buildQaFinalFilename(namespace, userId, validation.extension);
  const finalPath = path.join(uploadDir, finalName);
  const namespacePrefix = `${uploadDir}${path.sep}`;

  if (!finalPath.startsWith(namespacePrefix)) {
    await safeUnlink(filePath);
    throw new UploadRejectedError('Upload was rejected.');
  }

  let outputBuffer;
  try {
    outputBuffer = await reencodeValidatedRasterImage(filePath, validation.kind, config.reencodeLimits);
  } catch (error) {
    await safeUnlink(filePath);
    await logQaUploadEvent(req, namespace, 'validation_failed', {
      reason: error?.code || 'reencode_failed',
      message: error?.message,
      originalName: path.basename(originalName || ''),
      claimedMime,
    });
    console.warn(`${LOG_PREFIX} re-encode failed`, {
      namespace,
      userId,
      reason: error?.code,
      message: error?.message,
    });
    throw new UploadRejectedError('Upload was rejected.');
  } finally {
    await safeUnlink(filePath);
  }

  try {
    await fs.writeFile(finalPath, outputBuffer, { flag: 'wx' });
  } catch (error) {
    await safeUnlink(finalPath);
    await logQaUploadEvent(req, namespace, 'failed', {
      reason: 'write_failed',
      message: error?.message,
    });
    console.error(`${LOG_PREFIX} write failed`, { namespace, userId, message: error?.message || error });
    throw new UploadRejectedError('Failed to store uploaded image.');
  }

  const url = buildQaImageUrl(namespace, finalName);
  await logQaUploadEvent(req, namespace, 'success', {
    filename: finalName,
    kind: validation.kind,
    size: outputBuffer.length,
    originalSize: size,
  });

  return { url, kind: validation.kind, filename: finalName };
}
