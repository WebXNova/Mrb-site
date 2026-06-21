/**
 * Embed question-bank images as base64 data URIs in CSV export HTML,
 * and rematerialize them on CSV import.
 */

import { UploadRejectedError } from '../errors/media/MediaErrors.js';
import { ZIP_IMAGE_ENTRY_MAX_BYTES } from '../constants/testRichContent.constants.js';
import { getQuestionBankMediaStorageProvider } from '../storage/mediaStorage.factory.js';
import { resolveQuestionBankFilenameFromUrl } from '../storage/localQuestionBankStorage.provider.js';
import {
  collectTestExportMediaRefs,
  rewriteImportPackageMediaUrls,
} from '../utils/testExportMediaRefs.js';
import { validateSecureRasterImageUpload } from '../utils/secureRasterImageValidation.js';
import { QUESTION_BANK_UPLOAD_MAX_BYTES } from '../services/questionBankImageUpload.service.js';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { safeUnlink } from '../services/questionBankImageUpload.service.js';

const DATA_URI_PATTERN = /data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/=]+)/gi;
const UPLOAD_URL_PATTERN = /^\/api\/uploads\/question-bank\/[a-f0-9]{48}\.(jpg|png|webp)$/i;

const MIME_BY_EXT = Object.freeze({
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
});

/**
 * @param {string} value
 * @returns {string[]}
 */
export function extractDataUrisFromValue(value) {
  const uris = [];
  const text = String(value ?? '');
  if (!text.includes('data:image/')) return uris;
  let match;
  const re = new RegExp(DATA_URI_PATTERN.source, DATA_URI_PATTERN.flags);
  while ((match = re.exec(text)) !== null) {
    const subtype = String(match[1] ?? '').toLowerCase();
    const b64 = String(match[2] ?? '');
    if (b64) {
      uris.push(`data:image/${subtype};base64,${b64}`);
    }
  }
  return uris;
}

/**
 * @param {string} value
 * @param {Map<string, string>} replacements
 */
function replaceInValue(value, replacements) {
  if (value == null || String(value).trim() === '') return value;
  let next = String(value);
  for (const [from, to] of replacements.entries()) {
    if (from && to && from !== to) {
      next = next.split(from).join(to);
    }
  }
  return next;
}

/**
 * @param {Buffer} buffer
 * @param {string} contentType
 */
function bufferToDataUri(buffer, contentType) {
  return `data:${contentType};base64,${buffer.toString('base64')}`;
}

/**
 * @param {string} filename
 */
function contentTypeForFilename(filename) {
  const ext = String(filename).split('.').pop()?.toLowerCase() ?? '';
  return MIME_BY_EXT[ext] ?? 'image/png';
}

/**
 * Inline upload URLs as base64 data URIs for self-contained CSV export.
 *
 * @param {Record<string, unknown>} document
 * @returns {Promise<{ document: Record<string, unknown>, inlined_count: number, warnings: Array<{ code: string, message: string, url?: string }> }>}
 */
export async function inlineMediaInExportDocument(document) {
  const refs = collectTestExportMediaRefs(document);
  const storage = getQuestionBankMediaStorageProvider();
  /** @type {Map<string, string>} */
  const replacements = new Map();
  /** @type {Array<{ code: string, message: string, url?: string }>} */
  const warnings = [];
  let inlinedCount = 0;

  for (const ref of refs.values()) {
    if (ref.external || ref.broken) {
      warnings.push({
        code: ref.external ? 'EXTERNAL_MEDIA_NOT_INLINED' : 'BROKEN_MEDIA_NOT_INLINED',
        message: `Image was not inlined in CSV: ${ref.originalUrl}`,
        url: ref.originalUrl,
      });
      continue;
    }

    const url = ref.originalUrl;
    if (replacements.has(url)) continue;

    if (!UPLOAD_URL_PATTERN.test(url)) continue;

    const filename = resolveQuestionBankFilenameFromUrl(url);
    if (!filename) {
      warnings.push({
        code: 'EXPORT_MEDIA_BROKEN_LINK',
        message: `Broken image reference: ${url}`,
        url,
      });
      continue;
    }

    const buffer = await storage.readByFilename(filename);
    if (!buffer) {
      warnings.push({
        code: 'EXPORT_MEDIA_FILE_MISSING',
        message: `Missing image file on server: ${url}`,
        url,
      });
      continue;
    }

    if (buffer.length > ZIP_IMAGE_ENTRY_MAX_BYTES) {
      warnings.push({
        code: 'EXPORT_MEDIA_FILE_TOO_LARGE',
        message: `Image exceeds inline size limit (${ZIP_IMAGE_ENTRY_MAX_BYTES} bytes): ${url}`,
        url,
      });
      continue;
    }

    const contentType = contentTypeForFilename(filename);
    replacements.set(url, bufferToDataUri(buffer, contentType));
    inlinedCount += 1;
  }

  const questions = (Array.isArray(document.questions) ? document.questions : []).map((q) => {
    const options = (Array.isArray(q.options) ? q.options : []).map((opt) => ({
      ...opt,
      image_url: opt.image_url == null ? null : replaceInValue(opt.image_url, replacements),
      option_html: replaceInValue(opt.option_html, replacements),
      option_text: replaceInValue(opt.option_text, replacements),
    }));

    return {
      ...q,
      question_image_url:
        q.question_image_url == null ? null : replaceInValue(q.question_image_url, replacements),
      question_html: replaceInValue(q.question_html, replacements),
      question_text: replaceInValue(q.question_text, replacements),
      explanation_html: replaceInValue(q.explanation_html, replacements),
      explanation: replaceInValue(q.explanation, replacements),
      options,
    };
  });

  return {
    document: { ...document, questions },
    inlined_count: inlinedCount,
    warnings,
  };
}

/**
 * @param {string} dataUri
 */
function decodeDataUri(dataUri) {
  const match = /^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/=]+)$/i.exec(String(dataUri).trim());
  if (!match) return null;
  const subtype = match[1].toLowerCase();
  const ext = subtype === 'jpeg' ? 'jpg' : subtype;
  try {
    const buffer = Buffer.from(match[2], 'base64');
    if (!buffer.length) return null;
    const mime = MIME_BY_EXT[ext] ?? 'image/png';
    return { buffer, ext, mime, originalName: `import-inline.${ext}` };
  } catch {
    return null;
  }
}

/**
 * @param {Buffer} buffer
 * @param {string} originalName
 * @param {string} claimedMime
 */
async function scanImportImageBuffer(buffer, originalName, claimedMime) {
  const tempPath = path.join(
    os.tmpdir(),
    `mrb-csv-import-${Date.now()}-${Math.random().toString(16).slice(2)}.upload`
  );
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
 * Collect all data URIs from an import package.
 *
 * @param {Record<string, unknown>} pkg
 */
export function collectCsvImportDataUris(pkg) {
  /** @type {Set<string>} */
  const uris = new Set();
  const questions = Array.isArray(pkg?.questions) ? pkg.questions : [];

  for (const q of questions) {
    for (const uri of extractDataUrisFromValue(q.question_html)) uris.add(uri);
    for (const uri of extractDataUrisFromValue(q.explanation_html)) uris.add(uri);
    if (q.question_image_url) {
      for (const uri of extractDataUrisFromValue(q.question_image_url)) uris.add(uri);
      if (String(q.question_image_url).trim().startsWith('data:image/')) {
        uris.add(String(q.question_image_url).trim());
      }
    }

    const options = Array.isArray(q.options) ? q.options : [];
    for (const opt of options) {
      for (const uri of extractDataUrisFromValue(opt.option_html)) uris.add(uri);
      if (opt.image_url) {
        for (const uri of extractDataUrisFromValue(opt.image_url)) uris.add(uri);
        if (String(opt.image_url).trim().startsWith('data:image/')) {
          uris.add(String(opt.image_url).trim());
        }
      }
    }
  }

  return uris;
}

/**
 * Upload embedded base64 images from CSV import and rewrite URLs.
 *
 * @param {Record<string, unknown>} pkg
 * @param {{ userId?: number|null, role?: string|null }} actor
 */
export async function rematerializeCsvImportMedia(pkg, actor = {}) {
  const uris = collectCsvImportDataUris(pkg);
  if (!uris.size) {
    return { package: pkg, uploadedFilenames: [] };
  }

  const storage = getQuestionBankMediaStorageProvider();
  /** @type {Map<string, string>} */
  const urlMap = new Map();
  /** @type {string[]} */
  const uploadedFilenames = [];

  for (const dataUri of uris) {
    if (urlMap.has(dataUri)) continue;

    const decoded = decodeDataUri(dataUri);
    if (!decoded) {
      const error = new UploadRejectedError(`Invalid embedded image data URI in CSV import.`);
      error.code = 'IMPORT_MEDIA_INVALID_DATA_URI';
      throw error;
    }

    if (decoded.buffer.length > ZIP_IMAGE_ENTRY_MAX_BYTES) {
      const error = new UploadRejectedError(
        `Embedded image exceeds maximum size (${ZIP_IMAGE_ENTRY_MAX_BYTES} bytes).`
      );
      error.code = 'IMPORT_MEDIA_FILE_TOO_LARGE';
      throw error;
    }

    try {
      await scanImportImageBuffer(decoded.buffer, decoded.originalName, decoded.mime);
    } catch (error) {
      const wrapped = new UploadRejectedError(
        `Rejected unsafe embedded image: ${error instanceof Error ? error.message : String(error)}`
      );
      wrapped.code = error?.code ?? 'IMPORT_MEDIA_SECURITY_REJECTED';
      throw wrapped;
    }

    const stored = await storage.storeRasterImage({
      buffer: decoded.buffer,
      originalName: decoded.originalName,
      claimedMime: decoded.mime,
      actor,
    });

    urlMap.set(dataUri, stored.url);
    uploadedFilenames.push(stored.url.split('/').pop());
  }

  return {
    package: rewriteImportPackageMediaUrls(pkg, urlMap),
    uploadedFilenames,
  };
}
