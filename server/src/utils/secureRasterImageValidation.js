import fs from 'fs';
import path from 'path';
import { detectImageKindFromFile } from './imageMagicBytes.js';

/** Client extension allowlist — must agree with detected magic bytes. */
const ALLOWED_EXTENSIONS = Object.freeze({
  jpeg: new Set(['.jpg', '.jpeg']),
  png: new Set(['.png']),
  webp: new Set(['.webp']),
});

const BLOCKED_EXTENSIONS = new Set([
  '.zip',
  '.rar',
  '.7z',
  '.svg',
  '.gif',
  '.pdf',
  '.docx',
  '.exe',
  '.js',
  '.html',
  '.htm',
  '.php',
  '.phtml',
  '.bat',
  '.cmd',
  '.sh',
  '.msi',
  '.dll',
]);

const ALLOWED_MIME_BY_KIND = Object.freeze({
  jpeg: new Set(['image/jpeg', 'image/jpg']),
  png: new Set(['image/png']),
  webp: new Set(['image/webp']),
});

/** Text markers injected immediately after a JPEG header. */
const EARLY_INJECTION_MARKERS = Object.freeze([
  Buffer.from('<?php'),
  Buffer.from('<?='),
  Buffer.from('<script'),
  Buffer.from('<html'),
  Buffer.from('%PDF'),
  Buffer.from('PK\x03\x04'),
]);

/** Markers appended after the image end (polyglot suffix attacks). */
const TRAILING_MARKERS = EARLY_INJECTION_MARKERS;

/** Bytes after the JPEG SOI where polyglot payloads are typically injected. */
const JPEG_EARLY_SCAN_START = 3;
const JPEG_EARLY_SCAN_BYTES = 64;

const JPEG_EOI = Buffer.from([0xff, 0xd9]);
const PNG_IEND = Buffer.from([0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);

/**
 * Reject path traversal and double extensions (e.g. shell.php.jpg).
 * @param {string} base
 */
function assertSafeBasename(base) {
  if (!base || base.includes('..') || /[\\/]/.test(base)) {
    return { ok: false, reason: 'invalid_filename', ext: null };
  }
  const segments = base.split('.');
  if (segments.length < 2) {
    return { ok: false, reason: 'missing_extension', ext: null };
  }
  for (let i = 1; i < segments.length - 1; i += 1) {
    const innerExt = `.${segments[i].toLowerCase()}`;
    if (BLOCKED_EXTENSIONS.has(innerExt)) {
      return { ok: false, reason: 'double_extension', ext: innerExt };
    }
  }
  return { ok: true };
}

/**
 * @param {string} originalName
 */
export function normalizeUploadExtension(originalName) {
  const raw = String(originalName || '');
  if (raw.includes('..') || /[\\/]/.test(raw)) {
    return { ok: false, reason: 'invalid_filename', ext: null };
  }

  const base = path.basename(raw);
  const safe = assertSafeBasename(base);
  if (!safe.ok) {
    return { ok: false, reason: safe.reason, ext: safe.ext };
  }

  const ext = path.extname(base).toLowerCase();
  if (!ext) {
    return { ok: false, reason: 'missing_extension', ext: null };
  }
  if (BLOCKED_EXTENSIONS.has(ext)) {
    return { ok: false, reason: 'blocked_extension', ext };
  }
  return { ok: true, ext };
}

/**
 * @param {Buffer} buf
 */
function findJpegTrailingStart(buf) {
  for (let i = buf.length - 2; i >= 0; i -= 1) {
    if (buf[i] === JPEG_EOI[0] && buf[i + 1] === JPEG_EOI[1]) {
      return i + JPEG_EOI.length;
    }
  }
  return null;
}

/**
 * @param {Buffer} buf
 */
function findPngTrailingStart(buf) {
  const lastIdx = buf.lastIndexOf(PNG_IEND);
  if (lastIdx !== -1) {
    return lastIdx + PNG_IEND.length;
  }
  return 8;
}

/**
 * @param {Buffer} buf
 */
function findWebpTrailingStart(buf) {
  if (buf.length < 8) return null;
  const riffSize = buf.readUInt32LE(4);
  const declaredEnd = 8 + riffSize;
  if (!Number.isFinite(riffSize) || declaredEnd > buf.length) {
    return 12;
  }
  return declaredEnd;
}

/**
 * Scan only the post-JPEG-header band and bytes appended after the image end marker.
 * PNG/WebP bodies are not scanned — only trailing payload bytes after IEND/RIFF end.
 *
 * @param {string} filePath
 * @param {'jpeg'|'png'|'webp'} kind
 */
function readPolyglotScanBuffers(filePath, kind) {
  const buf = fs.readFileSync(filePath);
  if (buf.length === 0) {
    return { earlyRegion: Buffer.alloc(0), trailingRegion: Buffer.alloc(0) };
  }

  let earlyRegion = Buffer.alloc(0);
  if (kind === 'jpeg') {
    const earlyEnd = Math.min(buf.length, JPEG_EARLY_SCAN_START + JPEG_EARLY_SCAN_BYTES);
    if (earlyEnd > JPEG_EARLY_SCAN_START) {
      earlyRegion = buf.subarray(JPEG_EARLY_SCAN_START, earlyEnd);
    }
  }

  let trailingStart = null;
  if (kind === 'jpeg') trailingStart = findJpegTrailingStart(buf);
  else if (kind === 'png') trailingStart = findPngTrailingStart(buf);
  else if (kind === 'webp') trailingStart = findWebpTrailingStart(buf);

  const trailingRegion =
    trailingStart != null && trailingStart < buf.length ? buf.subarray(trailingStart) : Buffer.alloc(0);

  return { earlyRegion, trailingRegion };
}

function containsDangerousMarker(earlyRegion, trailingRegion) {
  for (const marker of EARLY_INJECTION_MARKERS) {
    if (earlyRegion.includes(marker)) {
      return marker.toString('utf8', 0, Math.min(marker.length, 16));
    }
  }
  for (const marker of TRAILING_MARKERS) {
    if (trailingRegion.includes(marker)) {
      return marker.toString('utf8', 0, Math.min(marker.length, 16));
    }
  }
  return null;
}

/**
 * @param {string} kind
 */
export function extensionForImageKind(kind) {
  if (kind === 'jpeg') return '.jpg';
  if (kind === 'png') return '.png';
  if (kind === 'webp') return '.webp';
  return null;
}

/**
 * Validate raster upload using magic bytes, extension agreement, and polyglot heuristics.
 * Does not trust client MIME for acceptance — MIME mismatch is reported for logging only.
 *
 * @param {{ filePath: string, originalName?: string, claimedMime?: string, size?: number, maxBytes?: number }}
 * @returns {{ kind: 'jpeg'|'png'|'webp', extension: string, mimeMismatch: boolean }}
 */
export function validateSecureRasterImageUpload({
  filePath,
  originalName = '',
  claimedMime = '',
  size,
  maxBytes = 5 * 1024 * 1024,
}) {
  if (size != null && size > maxBytes) {
    throw Object.assign(new Error('File exceeds maximum allowed size.'), { code: 'FILE_TOO_LARGE' });
  }

  const extResult = normalizeUploadExtension(originalName);
  if (!extResult.ok) {
    throw Object.assign(new Error('File type is not allowed.'), {
      code: 'BLOCKED_EXTENSION',
      ext: extResult.ext,
    });
  }

  const kind = detectImageKindFromFile(filePath);
  if (!kind) {
    throw Object.assign(new Error('File content is not a supported image format.'), { code: 'INVALID_SIGNATURE' });
  }

  const allowedExts = ALLOWED_EXTENSIONS[kind];
  if (!extResult.ext || !allowedExts.has(extResult.ext)) {
    throw Object.assign(new Error('File extension does not match image content.'), {
      code: 'EXTENSION_SIGNATURE_MISMATCH',
      ext: extResult.ext,
      kind,
    });
  }

  const { earlyRegion, trailingRegion } = readPolyglotScanBuffers(filePath, kind);
  const dangerous = containsDangerousMarker(earlyRegion, trailingRegion);
  if (dangerous) {
    throw Object.assign(new Error('File contains disallowed embedded content.'), {
      code: 'POLYGLOT_REJECTED',
      marker: dangerous,
    });
  }

  const normalizedMime = String(claimedMime || '').trim().toLowerCase();
  const allowedMime = ALLOWED_MIME_BY_KIND[kind];
  const mimeMismatch =
    normalizedMime !== '' && !allowedMime.has(normalizedMime);

  const extension = extensionForImageKind(kind);
  if (!extension) {
    throw Object.assign(new Error('Unsupported image kind.'), { code: 'INVALID_KIND' });
  }

  return { kind, extension, mimeMismatch };
}
