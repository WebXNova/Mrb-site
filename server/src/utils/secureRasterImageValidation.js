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

/** Polyglot / disguised payload markers (case-sensitive where relevant). */
const DANGEROUS_MARKERS = Object.freeze([
  Buffer.from('<?php'),
  Buffer.from('<?'),
  Buffer.from('<script'),
  Buffer.from('<html'),
  Buffer.from('%PDF'),
  Buffer.from('PK\x03\x04'),
  Buffer.from('MZ'),
  Buffer.from('#!/'),
]);

/**
 * @param {string} originalName
 */
export function normalizeUploadExtension(originalName) {
  const base = path.basename(String(originalName || ''));
  const ext = path.extname(base).toLowerCase();
  if (!ext) return '';
  if (BLOCKED_EXTENSIONS.has(ext)) {
    return { ok: false, reason: 'blocked_extension', ext };
  }
  return { ok: true, ext };
}

/**
 * @param {string} filePath
 */
function readProbeBuffer(filePath, maxBytes = 512) {
  const fd = fs.openSync(filePath, 'r');
  try {
    const buf = Buffer.alloc(maxBytes);
    const n = fs.readSync(fd, buf, 0, maxBytes, 0);
    return buf.subarray(0, n);
  } finally {
    fs.closeSync(fd);
  }
}

function containsDangerousMarker(buf) {
  for (const marker of DANGEROUS_MARKERS) {
    if (buf.includes(marker)) return marker.toString('utf8', 0, Math.min(marker.length, 16));
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

  const probe = readProbeBuffer(filePath);
  const dangerous = containsDangerousMarker(probe);
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
