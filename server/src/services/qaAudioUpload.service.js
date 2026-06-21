import { randomBytes } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { UploadRejectedError } from '../errors/media/MediaErrors.js';
import { QA_AUDIT_CATEGORIES } from '../constants/qaAudit.schema.js';
import { getQaAudioUploadConfig } from '../config/qaAudioUpload.config.js';
import { validateSecureAudioUpload } from '../utils/secureAudioValidation.js';
import { writeQaAuditEventFromReq } from './qaAuditLog.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsRoot = path.resolve(__dirname, '../../uploads');

/** @type {ReadonlySet<string>} */
export const QA_AUDIO_UPLOAD_NAMESPACES = new Set(['student-qa', 'teacher-qa']);

const AUDIT_ENTITY_BY_NAMESPACE = Object.freeze({
  'student-qa': 'student_qa_audio_upload',
  'teacher-qa': 'teacher_qa_audio_upload',
});

const AUDIT_ACTION_PREFIX = Object.freeze({
  'student-qa': 'student.question.recording',
  'teacher-qa': 'teacher.question.recording',
});

const LOG_PREFIX = '[qa-audio-upload]';

function uploadRejectionMessage(error) {
  const config = getQaAudioUploadConfig();
  switch (error?.code) {
    case 'AUDIO_TOO_SHORT':
      return 'Recording is too short. Please record at least one second.';
    case 'AUDIO_TOO_LONG':
      return `Recording exceeds the maximum allowed duration (${config.maxDurationSec} seconds).`;
    case 'AUDIO_TRUNCATED':
      return 'Recording file is incomplete. Please record again.';
    case 'AUDIO_PARSE_FAILED':
      return 'Recording could not be processed. Please record again.';
    case 'AUDIO_DURATION_UNKNOWN':
      return 'Recording duration could not be verified. Please record again in Chrome or Edge.';
    case 'AUDIO_TOO_LARGE':
      return `Recording is too large (max ${config.maxSizeLabelMb} MB).`;
    case 'AUDIO_SIZE_MISMATCH':
      return 'Recording upload was interrupted. Please record again.';
    case 'NO_AUDIO_TRACK':
      return 'No audio was detected in the recording. Please check your microphone and try again.';
    case 'BLOCKED_EXTENSION':
      return 'Recording format is not supported. Only WebM, OGG, or M4A recordings are allowed.';
    case 'CODEC_NOT_ALLOWED':
    case 'CONTAINER_MISMATCH':
    case 'EXTENSION_SIGNATURE_MISMATCH':
    case 'INVALID_SIGNATURE':
    case 'POLYGLOT_REJECTED':
    case 'INVALID_KIND':
      return 'Recording format is not supported. Try Chrome or Edge.';
    default:
      return error?.message?.trim() || 'Recording upload was rejected.';
  }
}

/**
 * @param {string} namespace
 */
export function getQaAudioUploadDir(namespace) {
  const ns = String(namespace || '').trim();
  if (!QA_AUDIO_UPLOAD_NAMESPACES.has(ns)) {
    throw new UploadRejectedError('Recording upload was rejected.');
  }
  return path.resolve(uploadsRoot, ns);
}

/**
 * @param {number|string} userId
 */
export function generateQaAudioTempFilename(userId) {
  const uid = String(userId ?? '').trim();
  if (!uid || !/^\d+$/.test(uid)) {
    throw new UploadRejectedError('Recording upload was rejected.');
  }
  return `${uid}-rec-${randomBytes(16).toString('hex')}.upload`;
}

/**
 * @param {number|string} userId
 * @param {string} extension
 */
export function buildQaAudioFinalFilename(userId, extension) {
  const uid = String(userId ?? '').trim();
  if (!uid || !/^\d+$/.test(uid)) {
    throw new UploadRejectedError('Recording upload was rejected.');
  }
  const ext = String(extension || '').toLowerCase();
  if (!/^\.(webm|ogg|m4a)$/.test(ext)) {
    throw new UploadRejectedError('Recording upload was rejected.');
  }
  return `${uid}-rec-${randomBytes(24).toString('hex')}${ext}`;
}

/**
 * @param {string} namespace
 * @param {string} filename
 */
export function buildQaAudioUrl(namespace, filename) {
  const ns = String(namespace || '').trim();
  if (!QA_AUDIO_UPLOAD_NAMESPACES.has(ns)) {
    throw new UploadRejectedError('Recording upload was rejected.');
  }
  const base = path.basename(String(filename || ''));
  if (!base || base !== filename || base.includes('..') || /[\\/]/.test(base)) {
    throw new UploadRejectedError('Recording upload was rejected.');
  }
  if (!base.includes('-rec-')) {
    throw new UploadRejectedError('Recording upload was rejected.');
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
async function logQaAudioEvent(req, namespace, actionSuffix, metadata = {}) {
  const prefix = AUDIT_ACTION_PREFIX[namespace] || 'qa.recording';
  const entityType = AUDIT_ENTITY_BY_NAMESPACE[namespace] || 'qa_audio_upload';
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
export async function ensureQaAudioUploadDir(namespace) {
  const dir = getQaAudioUploadDir(namespace);
  await fs.mkdir(dir, { recursive: true });
}

/**
 * @param {import('express').Request} req
 * @param {{ namespace: string, filePath: string, originalName: string, claimedMime: string, size: number }} input
 */
export async function finalizeQaAudioUpload(req, input) {
  const { namespace, filePath, originalName, claimedMime, size } = input;
  const config = getQaAudioUploadConfig();
  const uploadDir = getQaAudioUploadDir(namespace);
  const userId = req.user?.id;

  let validation;
  try {
    validation = await validateSecureAudioUpload({
      filePath,
      originalName,
      claimedMime,
      size,
      maxBytes: config.maxBytes,
      maxDurationSec: config.maxDurationSec,
      minDurationSec: config.minDurationSec,
    });
  } catch (error) {
    await safeUnlink(filePath);
    await logQaAudioEvent(req, namespace, 'validation_failed', {
      reason: error?.code || 'validation_failed',
      message: error?.message,
      originalName: path.basename(originalName || ''),
      claimedMime,
      clientDurationIgnored: true,
    });
    console.warn(`${LOG_PREFIX} validation failed`, {
      namespace,
      userId,
      reason: error?.code,
      message: error?.message,
    });
    throw new UploadRejectedError(uploadRejectionMessage(error));
  }

  if (validation.mimeMismatch) {
    await logQaAudioEvent(req, namespace, 'mime_mismatch', {
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

  const finalName = buildQaAudioFinalFilename(userId, validation.extension);
  const finalPath = path.join(uploadDir, finalName);
  const namespacePrefix = `${uploadDir}${path.sep}`;

  if (!finalPath.startsWith(namespacePrefix)) {
    await safeUnlink(filePath);
    throw new UploadRejectedError('Recording upload was rejected.');
  }

  let outputBuffer;
  try {
    outputBuffer = await fs.readFile(filePath);
  } catch (readError) {
    await safeUnlink(filePath);
    await logQaAudioEvent(req, namespace, 'validation_failed', {
      reason: 'read_failed',
      message: readError?.message,
    });
    throw new UploadRejectedError('Recording upload was rejected.');
  } finally {
    await safeUnlink(filePath);
  }

  if (outputBuffer.length !== validation.sizeBytes) {
    await logQaAudioEvent(req, namespace, 'validation_failed', {
      reason: 'AUDIO_SIZE_MISMATCH',
    });
    throw new UploadRejectedError(uploadRejectionMessage({ code: 'AUDIO_SIZE_MISMATCH' }));
  }

  try {
    await fs.writeFile(finalPath, outputBuffer, { flag: 'wx' });
  } catch (error) {
    await safeUnlink(finalPath);
    await logQaAudioEvent(req, namespace, 'failed', {
      reason: 'write_failed',
      message: error?.message,
    });
    console.error(`${LOG_PREFIX} write failed`, { namespace, userId, message: error?.message || error });
    throw new UploadRejectedError('Failed to store recording.');
  }

  const url = buildQaAudioUrl(namespace, finalName);
  await logQaAudioEvent(req, namespace, 'success', {
    filename: finalName,
    kind: validation.kind,
    codec: validation.codec,
    durationSec: validation.durationSec,
    size: outputBuffer.length,
  });

  return {
    url,
    durationSec: validation.durationSec,
    kind: validation.kind,
    filename: finalName,
  };
}
