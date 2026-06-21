/**
 * Rematerialize bundled media during test import — storage agnostic.
 */

import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { UploadRejectedError } from '../errors/media/MediaErrors.js';
import { getQuestionBankMediaStorageProvider } from '../storage/mediaStorage.factory.js';
import { rewriteImportPackageMediaUrls } from '../utils/testExportMediaRefs.js';
import { validateSecureRasterImageUpload } from '../utils/secureRasterImageValidation.js';
import { QUESTION_BANK_UPLOAD_MAX_BYTES } from '../services/questionBankImageUpload.service.js';
import { safeUnlink } from '../services/questionBankImageUpload.service.js';

const MIME_BY_EXT = Object.freeze({
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
});

/**
 * @param {string} archivePath
 */
function claimedMimeForArchivePath(archivePath, manifestEntry) {
  if (manifestEntry?.content_type) return String(manifestEntry.content_type);
  const ext = String(archivePath).split('.').pop()?.toLowerCase() ?? '';
  return MIME_BY_EXT[ext] ?? 'application/octet-stream';
}

/**
 * Scan image buffer before storage upload.
 *
 * @param {Buffer} buffer
 * @param {string} originalName
 * @param {string} claimedMime
 */
async function scanImportImageBuffer(buffer, originalName, claimedMime) {
  const tempDir = os.tmpdir();
  const tempPath = path.join(tempDir, `mrb-import-${Date.now()}-${Math.random().toString(16).slice(2)}.upload`);
  await fs.writeFile(tempPath, buffer);
  try {
    return validateSecureRasterImageUpload({
      filePath: tempPath,
      originalName,
      claimedMime,
      size: buffer.length,
      maxBytes: QUESTION_BANK_UPLOAD_MAX_BYTES,
    });
  } finally {
    await safeUnlink(tempPath);
  }
}

/**
 * Upload bundled ZIP images and rewrite manifest URLs.
 *
 * @param {Record<string, unknown>} pkg
 * @param {Map<string, Buffer>} imageFiles
 * @param {{ userId?: number|null, role?: string|null }} actor
 */
export async function rematerializeZipImportMedia(pkg, imageFiles, actor = {}) {
  const storage = getQuestionBankMediaStorageProvider();
  /** @type {Map<string, string>} */
  const urlMap = new Map();

  const manifestMedia = Array.isArray(pkg.media) ? pkg.media : [];
  /** @type {Map<string, Record<string, unknown>>} */
  const manifestByPath = new Map(
    manifestMedia.map((entry) => [String(entry?.path ?? ''), entry])
  );

  const refs = new Set();
  for (const entry of manifestMedia) {
    const archivePath = String(entry?.path ?? '').trim();
    if (archivePath) refs.add(archivePath);
  }

  if (!refs.size) {
    for (const archivePath of imageFiles.keys()) {
      refs.add(archivePath);
    }
  }

  for (const archivePath of refs) {
    const buffer = imageFiles.get(archivePath);
    if (!buffer) {
      const error = new UploadRejectedError(`Missing bundled image: ${archivePath}`);
      error.code = 'IMPORT_MEDIA_FILE_MISSING';
      throw error;
    }

    const manifestEntry = manifestByPath.get(archivePath);
    const originalName = path.basename(archivePath);
    const claimedMime = claimedMimeForArchivePath(archivePath, manifestEntry);

    try {
      await scanImportImageBuffer(buffer, originalName, claimedMime);
    } catch (error) {
      const wrapped = new UploadRejectedError(
        `Rejected unsafe import image ${archivePath}: ${error instanceof Error ? error.message : String(error)}`
      );
      wrapped.code = error?.code ?? 'IMPORT_MEDIA_SECURITY_REJECTED';
      throw wrapped;
    }

    const stored = await storage.storeRasterImage({
      buffer,
      originalName,
      claimedMime,
      actor,
    });

    urlMap.set(archivePath, stored.url);
    const originalUrl = manifestEntry?.original_url;
    if (originalUrl) {
      urlMap.set(String(originalUrl), stored.url);
    }
  }

  return {
    package: rewriteImportPackageMediaUrls(pkg, urlMap),
    uploadedFilenames: [...urlMap.values()].map((url) => url.split('/').pop()).filter(Boolean),
  };
}
