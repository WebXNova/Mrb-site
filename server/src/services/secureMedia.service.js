/**
 * CEE Secure Media — no static file access; entitlement-validated streaming only.
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { createReadStream } from 'fs';
import { MediaAccessDeniedError, MediaNotFoundError } from '../errors/media/MediaErrors.js';
import { requireEntitlement } from '../security/cee/requireEntitlement.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsRoot = path.resolve(__dirname, '../../uploads');

/** Allowed namespaces under uploads/ — map to entitlement policy. */
const NAMESPACE_POLICY = {
  'student-qa': { requiresEntitlement: true, bindToUserPrefix: true },
  'course-covers': { requiresEntitlement: false, adminOnly: true },
};

/**
 * @param {string} namespace
 * @param {string} filename
 */
function resolveSafePath(namespace, filename) {
  const ns = String(namespace || '').trim();
  const base = path.basename(String(filename || ''));
  if (!ns || !base || base !== filename) {
    throw new MediaAccessDeniedError({ reason: 'invalid_path' });
  }
  if (base.includes('..') || /[\\/]/.test(base)) {
    throw new MediaAccessDeniedError({ reason: 'path_traversal' });
  }
  const full = path.resolve(uploadsRoot, ns, base);
  if (!full.startsWith(path.resolve(uploadsRoot, ns))) {
    throw new MediaAccessDeniedError({ reason: 'path_escape' });
  }
  return full;
}

/**
 * @param {number} userId
 * @param {string} namespace
 * @param {string} filename
 */
export async function assertMediaAccess(userId, namespace, filename) {
  const policy = NAMESPACE_POLICY[namespace];
  if (!policy) {
    throw new MediaAccessDeniedError({ namespace, reason: 'unknown_namespace' });
  }

  if (policy.adminOnly) {
    throw new MediaAccessDeniedError({ namespace, reason: 'admin_only_namespace' });
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
 * @param {string} namespace
 * @param {string} filename
 * @returns {Promise<{ stream: import('fs').ReadStream, size: number, contentType: string }>}
 */
export async function openEntitledMediaFile(userId, namespace, filename) {
  await assertMediaAccess(userId, namespace, filename);
  const filePath = resolveSafePath(namespace, filename);

  let stat;
  try {
    stat = await fs.stat(filePath);
  } catch {
    throw new MediaNotFoundError({ namespace, filename });
  }

  if (!stat.isFile()) {
    throw new MediaNotFoundError({ namespace, filename });
  }

  const ext = path.extname(filename).toLowerCase();
  const contentType =
    ext === '.png'
      ? 'image/png'
      : ext === '.webp'
        ? 'image/webp'
        : ext === '.gif'
          ? 'image/gif'
          : 'image/jpeg';

  return {
    stream: createReadStream(filePath),
    size: stat.size,
    contentType,
  };
}
