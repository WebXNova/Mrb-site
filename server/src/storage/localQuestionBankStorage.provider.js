/**
 * Local filesystem storage for question-bank raster images.
 */

import fs from 'fs/promises';
import path from 'path';
import {
  QUESTION_BANK_UPLOAD_DIR,
  buildQuestionBankImageUrl,
  ensureQuestionBankUploadDir,
  finalizeQuestionBankImageUpload,
  generateTempUploadFilename,
  safeUnlink,
} from '../services/questionBankImageUpload.service.js';
import { isValidQuestionBankUploadFilename } from '../utils/questionImageUrlValidation.js';

/** @type {import('./mediaStorage.types.js').QuestionBankMediaStorageProvider} */
export const localQuestionBankStorageProvider = {
  kind: 'local',

  async readByFilename(filename) {
    const base = path.basename(String(filename || ''));
    if (!isValidQuestionBankUploadFilename(base)) {
      return null;
    }
    const fullPath = path.join(QUESTION_BANK_UPLOAD_DIR, base);
    const prefix = `${QUESTION_BANK_UPLOAD_DIR}${path.sep}`;
    if (!fullPath.startsWith(prefix)) {
      return null;
    }
    try {
      return await fs.readFile(fullPath);
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  },

  async storeRasterImage({ buffer, originalName, claimedMime, actor = {} }) {
    await ensureQuestionBankUploadDir();
    const tempName = generateTempUploadFilename();
    const tempPath = path.join(QUESTION_BANK_UPLOAD_DIR, tempName);
    const prefix = `${QUESTION_BANK_UPLOAD_DIR}${path.sep}`;
    if (!tempPath.startsWith(prefix)) {
      throw new Error('Invalid temp storage path.');
    }

    await fs.writeFile(tempPath, buffer);

    const req = {
      user: { id: actor.userId ?? null, role: actor.role ?? 'system' },
      originalUrl: '',
      path: '',
    };

    try {
      const result = await finalizeQuestionBankImageUpload(req, {
        filePath: tempPath,
        originalName,
        claimedMime: claimedMime ?? 'application/octet-stream',
        size: buffer.length,
      });
      return {
        url: result.url,
        filename: result.filename,
        kind: result.kind,
        size: buffer.length,
      };
    } catch (error) {
      await safeUnlink(tempPath);
      throw error;
    }
  },
};

/**
 * Resolve upload URL to local filename.
 *
 * @param {string} url
 * @returns {string|null}
 */
export function resolveQuestionBankFilenameFromUrl(url) {
  const trimmed = String(url ?? '').trim();
  const match = trimmed.match(/^\/api\/uploads\/question-bank\/([a-f0-9]{48}\.(jpg|png|webp))$/i);
  return match ? match[1] : null;
}

export { buildQuestionBankImageUrl, QUESTION_BANK_UPLOAD_DIR };
