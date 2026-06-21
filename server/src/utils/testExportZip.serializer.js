/**
 * Build ZIP export bundles: test.json + images/
 */

import { PassThrough } from 'stream';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { ZipArchive } = require('archiver');
import { ApiError } from './apiError.js';
import {
  TEST_EXPORT_ZIP_MANIFEST,
  ZIP_IMAGE_ENTRY_MAX_BYTES,
} from '../constants/testRichContent.constants.js';
import { serializeTestExportJsonBuffer } from './testExportJson.serializer.js';
import {
  attachMediaBundleToExportDocument,
  collectTestExportMediaRefs,
  sha256Hex,
} from './testExportMediaRefs.js';
import { getQuestionBankMediaStorageProvider } from '../storage/mediaStorage.factory.js';
import { resolveQuestionBankFilenameFromUrl } from '../storage/localQuestionBankStorage.provider.js';

const MIME_BY_EXT = Object.freeze({
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
});

/**
 * @param {string} archivePath
 */
function contentTypeForArchivePath(archivePath) {
  const ext = String(archivePath).split('.').pop()?.toLowerCase() ?? '';
  return MIME_BY_EXT[ext] ?? 'application/octet-stream';
}

/**
 * Load bundled image bytes for export.
 *
 * @param {ReturnType<typeof collectTestExportMediaRefs>} refs
 */
export async function loadExportMediaFiles(refs) {
  const storage = getQuestionBankMediaStorageProvider();
  /** @type {Map<string, { originalUrl: string, archivePath: string, sha256: string, content_type: string, buffer: Buffer }>} */
  const bundled = new Map();
  /** @type {Array<{ code: string, message: string, url?: string }>} */
  const errors = [];

  for (const ref of refs.values()) {
    if (ref.external || ref.broken) continue;
    if (!ref.archivePath) continue;

    const filename = resolveQuestionBankFilenameFromUrl(ref.originalUrl);
    if (!filename) {
      errors.push({
        code: 'EXPORT_MEDIA_BROKEN_LINK',
        message: `Broken image reference: ${ref.originalUrl}`,
        url: ref.originalUrl,
      });
      continue;
    }

    const buffer = await storage.readByFilename(filename);
    if (!buffer) {
      errors.push({
        code: 'EXPORT_MEDIA_FILE_MISSING',
        message: `Missing image file on server: ${ref.originalUrl}`,
        url: ref.originalUrl,
      });
      continue;
    }

    if (buffer.length > ZIP_IMAGE_ENTRY_MAX_BYTES) {
      errors.push({
        code: 'EXPORT_MEDIA_FILE_TOO_LARGE',
        message: `Image exceeds export size limit: ${ref.originalUrl}`,
        url: ref.originalUrl,
      });
      continue;
    }

    if (!bundled.has(ref.archivePath)) {
      bundled.set(ref.archivePath, {
        originalUrl: ref.originalUrl,
        archivePath: ref.archivePath,
        sha256: sha256Hex(buffer),
        content_type: contentTypeForArchivePath(ref.archivePath),
        buffer,
      });
    }
  }

  return { bundled, errors };
}

/**
 * @param {Record<string, unknown>} document
 */
export async function buildTestExportZipBundle(document) {
  const refs = collectTestExportMediaRefs(document);
  const broken = [...refs.values()].filter((r) => r.broken);
  if (broken.length) {
    throw new ApiError(422, 'Export contains broken image links.', {
      code: 'EXPORT_MEDIA_BROKEN_LINK',
      issues: broken.map((b) => ({
        severity: 'error',
        code: 'EXPORT_MEDIA_BROKEN_LINK',
        message: `Broken image link: ${b.originalUrl}`,
        validationLayer: 'media',
      })),
    });
  }

  const { bundled, errors } = await loadExportMediaFiles(refs);
  const missing = errors.filter((e) => e.code === 'EXPORT_MEDIA_FILE_MISSING');
  if (missing.length) {
    throw new ApiError(422, 'Export failed because referenced image files are missing.', {
      code: 'EXPORT_MEDIA_FILE_MISSING',
      issues: missing.map((m) => ({
        severity: 'error',
        code: m.code,
        message: m.message,
        validationLayer: 'media',
      })),
    });
  }

  const fatal = errors.filter((e) => e.code !== 'EXPORT_MEDIA_FILE_MISSING');
  if (fatal.length) {
    throw new ApiError(422, fatal[0].message, { code: fatal[0].code, issues: fatal });
  }

  const manifest = attachMediaBundleToExportDocument(document, bundled);
  const manifestBuffer = serializeTestExportJsonBuffer(manifest);

  /** @type {Array<{ path: string, buffer: Buffer }>} */
  const entries = [{ path: TEST_EXPORT_ZIP_MANIFEST, buffer: manifestBuffer }];
  for (const item of bundled.values()) {
    entries.push({ path: item.archivePath, buffer: item.buffer });
  }

  const zipBuffer = await createZipBuffer(entries);
  return {
    manifest,
    zipBuffer,
    image_count: bundled.size,
    media_warnings: manifest.media_warnings ?? [],
  };
}

/**
 * @param {Array<{ path: string, buffer: Buffer }>} entries
 * @returns {Promise<Buffer>}
 */
export function createZipBuffer(entries) {
  return new Promise((resolve, reject) => {
    const archive = new ZipArchive({ zlib: { level: 6 } });
    const passthrough = new PassThrough();
    /** @type {Buffer[]} */
    const chunks = [];

    passthrough.on('data', (chunk) => chunks.push(chunk));
    passthrough.on('end', () => resolve(Buffer.concat(chunks)));
    passthrough.on('error', reject);
    archive.on('error', reject);
    archive.pipe(passthrough);

    for (const entry of entries) {
      archive.append(entry.buffer, { name: entry.path.replace(/\\/g, '/') });
    }

    archive.finalize();
  });
}
