/**
 * CEE Secure Media — no static file access; entitlement-validated streaming only.
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { createReadStream } from 'fs';
import { MediaAccessDeniedError, MediaNotFoundError } from '../errors/media/MediaErrors.js';
import { mysqlPool } from '../config/mysql.js';
import { requireEntitlement } from '../security/cee/requireEntitlement.js';
import { isQuestionBankStaffRole } from '../utils/isQuestionBankStaffRole.js';
import {
  COURSE_UPLOAD_CONTENT_TYPES,
  COURSE_UPLOAD_FILENAME_PATTERN,
  COURSE_UPLOAD_NAMESPACE,
  QUESTION_BANK_CONTENT_TYPES,
  QUESTION_BANK_FILENAME_PATTERN,
  QUESTION_BANK_NAMESPACE,
  SECURE_MEDIA_NAMESPACES,
} from '../constants/secureMedia.constants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsRoot = path.resolve(__dirname, '../../uploads');

/** Allowed namespaces under uploads/ — map to entitlement policy. */
const NAMESPACE_POLICY = {
  'student-qa': { requiresEntitlement: true, bindToUserPrefix: true },
  'teacher-qa': { requiresEntitlement: false, bindToUserPrefix: true, teacherPrefixOnly: true },
  'course-covers': { requiresEntitlement: false, catalogMedia: true },
  [COURSE_UPLOAD_NAMESPACE]: {
    requiresEntitlement: false,
    catalogMedia: true,
    validateFilename: true,
  },
  [QUESTION_BANK_NAMESPACE]: {
    requiresEntitlement: true,
    bindToUserPrefix: false,
    allowStaffRead: true,
    validateFilename: true,
  },
};

export { QUESTION_BANK_NAMESPACE };

/**
 * @param {string} namespace
 * @returns {boolean}
 */
export function isAllowedMediaNamespace(namespace) {
  return SECURE_MEDIA_NAMESPACES.has(String(namespace || '').trim());
}

/**
 * @param {string} filename
 */
function assertQuestionBankFilename(filename) {
  const base = path.basename(String(filename || ''));
  if (!QUESTION_BANK_FILENAME_PATTERN.test(base)) {
    throw new MediaAccessDeniedError({
      namespace: QUESTION_BANK_NAMESPACE,
      reason: 'invalid_filename',
      filename: base,
    });
  }
}

/**
 * @param {string} filename
 */
function assertCourseUploadFilename(filename) {
  const base = path.basename(String(filename || ''));
  if (!COURSE_UPLOAD_FILENAME_PATTERN.test(base)) {
    throw new MediaAccessDeniedError({
      namespace: COURSE_UPLOAD_NAMESPACE,
      reason: 'invalid_filename',
      filename: base,
    });
  }
}

/**
 * @param {string} namespace
 * @param {string} filename
 */
function resolveSafePath(namespace, filename) {
  const ns = String(namespace || '').trim();
  if (!isAllowedMediaNamespace(ns)) {
    throw new MediaAccessDeniedError({ namespace: ns, reason: 'unknown_namespace' });
  }

  const base = path.basename(String(filename || ''));
  if (!ns || !base || base !== filename) {
    throw new MediaAccessDeniedError({ reason: 'invalid_path' });
  }
  if (base.includes('..') || /[\\/]/.test(base)) {
    throw new MediaAccessDeniedError({ reason: 'path_traversal' });
  }

  if (ns === QUESTION_BANK_NAMESPACE) {
    assertQuestionBankFilename(base);
  }

  if (ns === COURSE_UPLOAD_NAMESPACE) {
    assertCourseUploadFilename(base);
  }

  const namespaceRoot = path.resolve(uploadsRoot, ns);
  const full = path.resolve(namespaceRoot, base);
  if (!full.startsWith(`${namespaceRoot}${path.sep}`) && full !== namespaceRoot) {
    throw new MediaAccessDeniedError({ reason: 'path_escape' });
  }
  return full;
}

/**
 * @param {string} namespace
 * @param {string} filename
 */
function resolveContentType(namespace, filename) {
  const ext = path.extname(filename).toLowerCase();

  if (namespace === QUESTION_BANK_NAMESPACE) {
    const contentType = QUESTION_BANK_CONTENT_TYPES[ext];
    if (!contentType) {
      throw new MediaAccessDeniedError({
        namespace,
        reason: 'unsupported_extension',
        filename,
      });
    }
    return contentType;
  }

  if (namespace === COURSE_UPLOAD_NAMESPACE) {
    const contentType = COURSE_UPLOAD_CONTENT_TYPES[ext];
    if (!contentType) {
      throw new MediaAccessDeniedError({
        namespace,
        reason: 'unsupported_extension',
        filename,
      });
    }
    return contentType;
  }

  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.webm') return 'audio/webm';
  if (ext === '.ogg') return 'audio/ogg';
  if (ext === '.m4a' || ext === '.mp4') return 'audio/mp4';
  return 'image/jpeg';
}

/**
 * Teachers may stream student-qa media only when assigned to the question that references the file.
 * @param {number} teacherId
 * @param {string} filename
 */
async function assertTeacherAssignedStudentQaMedia(teacherId, filename) {
  const base = path.basename(String(filename || ''));
  const likeSuffix = `%/${base}`;
  const [rows] = await mysqlPool.query(
    `SELECT id FROM student_questions
     WHERE assigned_teacher_id = ?
       AND (attachment_url LIKE ? OR audio_url LIKE ?)
     LIMIT 1`,
    [teacherId, likeSuffix, likeSuffix]
  );
  if (!rows[0]) {
    throw new MediaAccessDeniedError({
      reason: 'teacher_assignment_mismatch',
      userId: teacherId,
      filename: base,
    });
  }
}

async function assertStudentOwnedTeacherQaAnswerMedia(studentId, filename) {
  const base = path.basename(String(filename || ''));
  const likeSuffix = `%/${base}`;
  const [rows] = await mysqlPool.query(
    `SELECT id FROM student_questions
     WHERE user_id = ?
       AND (answer_attachment_url LIKE ? OR answer_audio_url LIKE ?)
     LIMIT 1`,
    [studentId, likeSuffix, likeSuffix]
  );
  if (!rows[0]) {
    throw new MediaAccessDeniedError({
      reason: 'student_answer_media_mismatch',
      userId: studentId,
      filename: base,
    });
  }
}

/**
 * @param {number} userId
 * @param {string} namespace
 * @param {string} filename
 * @param {{ role?: string|null }} [options]
 */
export async function assertMediaAccess(userId, namespace, filename, options = {}) {
  const ns = String(namespace || '').trim();
  const policy = NAMESPACE_POLICY[ns];
  if (!policy) {
    throw new MediaAccessDeniedError({ namespace: ns, reason: 'unknown_namespace' });
  }

  if (policy.validateFilename && ns === QUESTION_BANK_NAMESPACE) {
    assertQuestionBankFilename(filename);
  }

  if (policy.validateFilename && ns === COURSE_UPLOAD_NAMESPACE) {
    assertCourseUploadFilename(filename);
  }

  if (policy.adminOnly) {
    throw new MediaAccessDeniedError({ namespace: ns, reason: 'admin_only_namespace' });
  }

  if (policy.allowStaffRead && isQuestionBankStaffRole(options.role)) {
    return;
  }

  if (ns === 'student-qa' && options.role === 'teacher') {
    await assertTeacherAssignedStudentQaMedia(userId, filename);
    return;
  }

  if (ns === 'teacher-qa' && options.role === 'teacher') {
    const expectedPrefix = `${userId}-`;
    if (!String(filename).startsWith(expectedPrefix)) {
      throw new MediaAccessDeniedError({ reason: 'ownership_mismatch', userId, filename });
    }
    return;
  }

  if (ns === 'teacher-qa' && options.role === 'student') {
    await assertStudentOwnedTeacherQaAnswerMedia(userId, filename);
    return;
  }

  if (policy.requiresEntitlement) {
    await requireEntitlement(userId);
  }

  if (policy.bindToUserPrefix) {
    const expectedPrefix = `${userId}-`;
    if (!String(filename).startsWith(expectedPrefix)) {
      throw new MediaAccessDeniedError({ reason: 'ownership_mismatch', userId, filename });
    }
  }
}

/**
 * Open a publicly readable media file (e.g. course catalog covers).
 * @param {string} namespace
 * @param {string} filename
 * @returns {Promise<{ stream: import('fs').ReadStream, size: number, contentType: string }>}
 */
export async function openPublicMediaFile(namespace, filename) {
  const ns = String(namespace || '').trim();
  const policy = NAMESPACE_POLICY[ns];
  if (!policy?.catalogMedia && !policy?.publicRead) {
    throw new MediaAccessDeniedError({ namespace: ns, reason: 'not_public' });
  }

  const base = path.basename(String(filename || '').trim());
  const filePath = resolveSafePath(ns, base);

  let stat;
  try {
    stat = await fs.stat(filePath);
  } catch {
    throw new MediaNotFoundError({ namespace: ns, filename: base });
  }

  if (!stat.isFile()) {
    throw new MediaNotFoundError({ namespace: ns, filename: base });
  }

  const contentType = resolveContentType(ns, base);

  return {
    stream: createReadStream(filePath),
    size: stat.size,
    contentType,
  };
}

/**
 * @param {number} userId
 * @param {string} namespace
 * @param {string} filename
 * @param {{ role?: string|null }} [options]
 * @returns {Promise<{ stream: import('fs').ReadStream, size: number, contentType: string }>}
 */
export async function openEntitledMediaFile(userId, namespace, filename, options = {}) {
  const ns = String(namespace || '').trim();
  const base = path.basename(String(filename || '').trim());

  await assertMediaAccess(userId, ns, base, options);
  const filePath = resolveSafePath(ns, base);

  let stat;
  try {
    stat = await fs.stat(filePath);
  } catch {
    throw new MediaNotFoundError({ namespace: ns, filename: base });
  }

  if (!stat.isFile()) {
    throw new MediaNotFoundError({ namespace: ns, filename: base });
  }

  const contentType = resolveContentType(ns, base);

  return {
    stream: createReadStream(filePath),
    size: stat.size,
    contentType,
  };
}
