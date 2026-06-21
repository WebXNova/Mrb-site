/**
 * Parse and validate ZIP test import bundles.
 */

import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const yauzl = require('yauzl');
import {
  MAX_IMPORT_ZIP_BYTES,
  MAX_IMPORT_ZIP_ENTRIES,
  MAX_IMPORT_ZIP_UNCOMPRESSED_BYTES,
  TEST_EXPORT_JSON_VERSION,
  TEST_EXPORT_ZIP_MANIFEST,
  TEST_RICH_CONTENT_VALIDATION_LAYERS,
} from '../constants/testRichContent.constants.js';
import {
  collectTestExportMediaRefs,
  isSafeZipImageEntryPath,
  isSafeZipManifestPath,
  sha256Hex,
} from './testExportMediaRefs.js';

/**
 * @param {string} text
 */
function parseZipManifestJson(text) {
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return {
        ok: false,
        code: 'IMPORT_PAYLOAD_INVALID',
        message: 'Import payload must be a JSON object.',
        validationLayer: TEST_RICH_CONTENT_VALIDATION_LAYERS.JSON_PARSE,
      };
    }

    const version = parsed.version ?? parsed.format_version;
    const supported =
      version === TEST_EXPORT_JSON_VERSION ||
      version === '1.0' ||
      version === 1 ||
      parsed.format === 'mrb_test_rich_v1';

    if (!supported) {
      return {
        ok: false,
        code: 'UNSUPPORTED_SCHEMA_VERSION',
        message: `Unsupported import schema version "${version ?? 'unknown'}". Expected ${TEST_EXPORT_JSON_VERSION}.`,
        validationLayer: TEST_RICH_CONTENT_VALIDATION_LAYERS.SCHEMA_VERSION,
      };
    }

    return { ok: true, parsed };
  } catch {
    return {
      ok: false,
      code: 'IMPORT_PAYLOAD_CORRUPT',
      message: 'test.json could not be parsed.',
      validationLayer: TEST_RICH_CONTENT_VALIDATION_LAYERS.JSON_PARSE,
    };
  }
}

/**
 * @param {Buffer} buffer
 * @returns {Promise<Map<string, Buffer>>}
 */
function readZipEntries(buffer) {
  return new Promise((resolve, reject) => {
    /** @type {Map<string, Buffer>} */
    const entries = new Map();
    let totalUncompressed = 0;
    let entryCount = 0;

    yauzl.fromBuffer(buffer, { lazyEntries: true, validateEntrySizes: true }, (err, zipfile) => {
      if (err || !zipfile) {
        reject(err ?? new Error('Failed to open ZIP archive.'));
        return;
      }

      zipfile.readEntry();

      zipfile.on('entry', (entry) => {
        entryCount += 1;
        if (entryCount > MAX_IMPORT_ZIP_ENTRIES) {
          zipfile.close();
          reject(Object.assign(new Error('ZIP archive contains too many entries.'), { code: 'ZIP_TOO_MANY_ENTRIES' }));
          return;
        }

        const name = String(entry.fileName ?? '').replace(/\\/g, '/');
        if (entry.fileName.endsWith('/')) {
          zipfile.readEntry();
          return;
        }

        if (!isSafeZipManifestPath(name) && !isSafeZipImageEntryPath(name)) {
          zipfile.close();
          reject(
            Object.assign(new Error(`Unsafe or unsupported ZIP entry: ${name}`), {
              code: 'ZIP_UNSAFE_ENTRY',
            })
          );
          return;
        }

        totalUncompressed += Number(entry.uncompressedSize ?? 0);
        if (totalUncompressed > MAX_IMPORT_ZIP_UNCOMPRESSED_BYTES) {
          zipfile.close();
          reject(
            Object.assign(new Error('ZIP archive exceeds maximum uncompressed size.'), {
              code: 'ZIP_BOMB_REJECTED',
            })
          );
          return;
        }

        zipfile.openReadStream(entry, (streamErr, readStream) => {
          if (streamErr || !readStream) {
            zipfile.close();
            reject(streamErr ?? new Error(`Failed to read ZIP entry: ${name}`));
            return;
          }

          /** @type {Buffer[]} */
          const chunks = [];
          readStream.on('data', (chunk) => chunks.push(chunk));
          readStream.on('end', () => {
            const fileBuffer = Buffer.concat(chunks);
            if (entries.has(name)) {
              zipfile.close();
              reject(
                Object.assign(new Error(`Duplicate ZIP entry filename: ${name}`), {
                  code: 'ZIP_DUPLICATE_FILENAME',
                })
              );
              return;
            }
            entries.set(name, fileBuffer);
            zipfile.readEntry();
          });
          readStream.on('error', (readErr) => {
            zipfile.close();
            reject(readErr);
          });
        });
      });

      zipfile.on('end', () => resolve(entries));
      zipfile.on('error', reject);
    });
  });
}

/**
 * Validate media references against extracted ZIP entries.
 *
 * @param {Record<string, unknown>} manifest
 * @param {Map<string, Buffer>} entries
 */
export function validateZipMediaReferences(manifest, entries) {
  /** @type {Array<{ severity: 'error'|'warning', code: string, message: string, validationLayer: string }>} */
  const issues = [];

  const refs = collectTestExportMediaRefs(manifest);

  for (const ref of refs.values()) {
    if (ref.broken) {
      issues.push({
        severity: 'error',
        code: 'IMPORT_MEDIA_BROKEN_LINK',
        message: `Broken image link in manifest: ${ref.originalUrl}`,
        validationLayer: TEST_RICH_CONTENT_VALIDATION_LAYERS.MEDIA,
      });
      continue;
    }

    if (ref.external) {
      issues.push({
        severity: 'warning',
        code: 'IMPORT_MEDIA_EXTERNAL_URL',
        message: `External image URL is not bundled and may fail on a fresh server: ${ref.originalUrl}`,
        validationLayer: TEST_RICH_CONTENT_VALIDATION_LAYERS.MEDIA,
      });
      continue;
    }

    if (!ref.archivePath) continue;

    const fileBuffer = entries.get(ref.archivePath);
    if (!fileBuffer) {
      issues.push({
        severity: 'error',
        code: 'IMPORT_MEDIA_FILE_MISSING',
        message: `Referenced image missing from ZIP: ${ref.archivePath}`,
        validationLayer: TEST_RICH_CONTENT_VALIDATION_LAYERS.MEDIA,
      });
    }
  }

  const manifestMedia = Array.isArray(manifest.media) ? manifest.media : [];
  for (const item of manifestMedia) {
    const archivePath = String(item?.path ?? '').trim();
    if (!archivePath) continue;
    const fileBuffer = entries.get(archivePath);
    if (!fileBuffer) {
      issues.push({
        severity: 'error',
        code: 'IMPORT_MEDIA_MANIFEST_MISSING',
        message: `Media manifest entry missing from ZIP: ${archivePath}`,
        validationLayer: TEST_RICH_CONTENT_VALIDATION_LAYERS.MEDIA,
      });
      continue;
    }

    const expectedHash = String(item?.sha256 ?? '').trim().toLowerCase();
    if (expectedHash) {
      const actual = sha256Hex(fileBuffer);
      if (actual !== expectedHash) {
        issues.push({
          severity: 'error',
          code: 'IMPORT_MEDIA_HASH_MISMATCH',
          message: `Image checksum mismatch for ${archivePath}.`,
          validationLayer: TEST_RICH_CONTENT_VALIDATION_LAYERS.MEDIA,
        });
      }
    }
  }

  for (const [entryPath] of entries.entries()) {
    if (entryPath === TEST_EXPORT_ZIP_MANIFEST) continue;
    const referenced = [...refs.values()].some((r) => r.archivePath === entryPath);
    const inManifest = manifestMedia.some((m) => String(m?.path ?? '') === entryPath);
    if (!referenced && !inManifest) {
      issues.push({
        severity: 'warning',
        code: 'IMPORT_MEDIA_ORPHAN_FILE',
        message: `ZIP contains unreferenced image: ${entryPath}`,
        validationLayer: TEST_RICH_CONTENT_VALIDATION_LAYERS.MEDIA,
      });
    }
  }

  return issues;
}

/**
 * @param {Buffer} buffer
 */
export async function parseTestImportZip(buffer) {
  if (!Buffer.isBuffer(buffer)) {
    return {
      ok: false,
      code: 'ZIP_INVALID',
      message: 'Import payload must be a ZIP buffer.',
      validationLayer: TEST_RICH_CONTENT_VALIDATION_LAYERS.MEDIA,
    };
  }

  if (buffer.length === 0) {
    return {
      ok: false,
      code: 'ZIP_EMPTY',
      message: 'ZIP archive is empty.',
      validationLayer: TEST_RICH_CONTENT_VALIDATION_LAYERS.MEDIA,
    };
  }

  if (buffer.length > MAX_IMPORT_ZIP_BYTES) {
    return {
      ok: false,
      code: 'ZIP_TOO_LARGE',
      message: `ZIP archive exceeds maximum size (${MAX_IMPORT_ZIP_BYTES} bytes).`,
      validationLayer: TEST_RICH_CONTENT_VALIDATION_LAYERS.PAYLOAD_SIZE,
    };
  }

  let entries;
  try {
    entries = await readZipEntries(buffer);
  } catch (error) {
    return {
      ok: false,
      code: error?.code ?? 'ZIP_PARSE_FAILED',
      message: error instanceof Error ? error.message : 'Failed to parse ZIP archive.',
      validationLayer: TEST_RICH_CONTENT_VALIDATION_LAYERS.MEDIA,
    };
  }

  const manifestBuffer = entries.get(TEST_EXPORT_ZIP_MANIFEST);
  if (!manifestBuffer) {
    return {
      ok: false,
      code: 'ZIP_MANIFEST_MISSING',
      message: `ZIP archive must contain ${TEST_EXPORT_ZIP_MANIFEST}.`,
      validationLayer: TEST_RICH_CONTENT_VALIDATION_LAYERS.MEDIA,
    };
  }

  const jsonResult = parseZipManifestJson(manifestBuffer.toString('utf8'));
  if (!jsonResult.ok) {
    return { ...jsonResult, format: 'zip' };
  }

  /** @type {Map<string, Buffer>} */
  const imageFiles = new Map();
  for (const [entryPath, entryBuffer] of entries.entries()) {
    if (entryPath !== TEST_EXPORT_ZIP_MANIFEST) {
      imageFiles.set(entryPath, entryBuffer);
    }
  }

  const mediaIssues = validateZipMediaReferences(jsonResult.parsed, entries);
  const mediaErrors = mediaIssues.filter((i) => i.severity === 'error');
  if (mediaErrors.length) {
    return {
      ok: false,
      code: mediaErrors[0].code,
      message: mediaErrors[0].message,
      validationLayer: TEST_RICH_CONTENT_VALIDATION_LAYERS.MEDIA,
      issues: mediaIssues,
      format: 'zip',
    };
  }

  return {
    ok: true,
    format: 'zip',
    package: jsonResult.parsed,
    imageFiles,
    mediaIssues: mediaIssues.filter((i) => i.severity === 'warning'),
  };
}

/**
 * @param {string} contentBase64
 */
export function decodeZipImportContent(contentBase64) {
  let buffer;
  try {
    buffer = Buffer.from(String(contentBase64 ?? ''), 'base64');
  } catch {
    return {
      ok: false,
      code: 'ZIP_BASE64_INVALID',
      message: 'ZIP content is not valid base64.',
      validationLayer: TEST_RICH_CONTENT_VALIDATION_LAYERS.MEDIA,
    };
  }

  if (buffer.length === 0) {
    return {
      ok: false,
      code: 'ZIP_EMPTY',
      message: 'ZIP archive is empty.',
      validationLayer: TEST_RICH_CONTENT_VALIDATION_LAYERS.MEDIA,
    };
  }

  if (buffer.length > MAX_IMPORT_ZIP_BYTES) {
    return {
      ok: false,
      code: 'ZIP_TOO_LARGE',
      message: `ZIP archive exceeds maximum size (${MAX_IMPORT_ZIP_BYTES} bytes).`,
      validationLayer: TEST_RICH_CONTENT_VALIDATION_LAYERS.PAYLOAD_SIZE,
    };
  }

  return { ok: true, buffer };
}

/**
 * Detect ZIP payload from base64 prefix or magic bytes after decode.
 *
 * @param {string} content
 */
export function isLikelyZipImportContent(content) {
  const trimmed = String(content ?? '').trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('UEs')) return true;
  try {
    const head = Buffer.from(trimmed.slice(0, 24), 'base64');
    return head.length >= 2 && head[0] === 0x50 && head[1] === 0x4b;
  } catch {
    return false;
  }
}
