/**
 * CEE Secure Media — no static file access; entitlement-validated streaming only.
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { createReadStream } from 'fs';
import { MediaAccessDeniedError, MediaNotFoundError } from '../errors/media/MediaErrors.js';
import { requireEntitlement } from '../security/cee/requireEntitlement.js';
import { isQuestionBankStaffRole } from '../utils/isQuestionBankStaffRole.js';
import {
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
  'course-covers': { requiresEntitlement: false, adminOnly: true },
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

  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  return 'image/jpeg';
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

  if (policy.adminOnly) {
    throw new MediaAccessDeniedError({ namespace: ns, reason: 'admin_only_namespace' });
  }

  if (policy.allowStaffRead && isQuestionBankStaffRole(options.role)) {
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
