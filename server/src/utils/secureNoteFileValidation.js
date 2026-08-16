import fs from 'fs';
import path from 'path';
import { detectImageKindFromFile } from './imageMagicBytes.js';
import { normalizeUploadExtension } from './secureRasterImageValidation.js';

const PDF_HEADER = Buffer.from('%PDF-');
const ZIP_HEADER = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

const NOTE_ALLOWED_EXTENSIONS = Object.freeze({
  pdf: new Set(['.pdf']),
  jpeg: new Set(['.jpg', '.jpeg']),
  png: new Set(['.png']),
  docx: new Set(['.docx']),
});

/** Final extensions accepted for course note uploads (multer + magic-byte validation). */
export const NOTE_UPLOAD_FINAL_EXTENSIONS = new Set([
  ...NOTE_ALLOWED_EXTENSIONS.pdf,
  ...NOTE_ALLOWED_EXTENSIONS.jpeg,
  ...NOTE_ALLOWED_EXTENSIONS.png,
  ...NOTE_ALLOWED_EXTENSIONS.docx,
]);

const EXTENSION_BY_KIND = Object.freeze({
  pdf: '.pdf',
  jpeg: '.jpg',
  png: '.png',
  docx: '.docx',
});

/**
 * @param {Buffer} buf
 */
function startsWithBuffer(buf, prefix) {
  if (buf.length < prefix.length) return false;
  return buf.subarray(0, prefix.length).equals(prefix);
}

/**
 * @param {string} filePath
 * @param {number} [maxScanBytes]
 */
function readScanSample(filePath, maxScanBytes = 512 * 1024) {
  const stat = fs.statSync(filePath);
  const size = Number(stat.size || 0);
  const fd = fs.openSync(filePath, 'r');
  try {
    const headLen = Math.min(size, maxScanBytes);
    const head = Buffer.alloc(headLen);
    fs.readSync(fd, head, 0, headLen, 0);
    if (size <= maxScanBytes) {
      return head;
    }
    const tailLen = Math.min(64 * 1024, size);
    const tail = Buffer.alloc(tailLen);
    fs.readSync(fd, tail, 0, tailLen, size - tailLen);
    return Buffer.concat([head, tail]);
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * @param {string} filePath
 */
function validatePdfMagic(filePath) {
  const fd = fs.openSync(filePath, 'r');
  try {
    const buf = Buffer.alloc(8);
    const n = fs.readSync(fd, buf, 0, 8, 0);
    if (n < 5 || !startsWithBuffer(buf.subarray(0, n), PDF_HEADER)) {
      throw new Error('File must be a valid PDF document.');
    }
    if (startsWithBuffer(buf.subarray(0, n), ZIP_HEADER)) {
      throw new Error('File must be a valid PDF document.');
    }
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * DOCX is OOXML — ZIP container with word/ and [Content_Types].xml entries.
 * @param {string} filePath
 */
function validateDocxMagic(filePath) {
  const sample = readScanSample(filePath);
  if (!startsWithBuffer(sample, ZIP_HEADER)) {
    throw new Error('File must be a valid DOCX document.');
  }
  if (startsWithBuffer(sample, PDF_HEADER)) {
    throw new Error('File must be a valid DOCX document.');
  }
  const latin = sample.toString('latin1');
  if (!latin.includes('[Content_Types].xml') || !latin.includes('word/')) {
    throw new Error('File must be a valid DOCX document.');
  }
}

/**
 * @param {{ filePath: string, originalName?: string, claimedMime?: string, size?: number, maxBytes?: number }}
 * @returns {{ kind: 'pdf'|'jpeg'|'png'|'docx', extension: string, fileType: 'pdf'|'image'|'docx' }}
 */
export function validateSecureNoteFileUpload({
  filePath,
  originalName = '',
  claimedMime = '',
  size,
  maxBytes,
}) {
  const statSize = Number(fs.statSync(filePath).size || 0);
  const byteSize = Number.isFinite(Number(size)) ? Number(size) : statSize;
  if (maxBytes != null && byteSize > maxBytes) {
    throw new Error(`File must be ${Math.floor(maxBytes / (1024 * 1024))} MB or smaller.`);
  }

  const extResult = normalizeUploadExtension(originalName || '', {
    allowedFinalExtensions: NOTE_UPLOAD_FINAL_EXTENSIONS,
  });
  if (!extResult.ok) {
    throw new Error('Unsupported file type.');
  }

  const ext = extResult.ext;
  const imageKind = detectImageKindFromFile(filePath);

  if (NOTE_ALLOWED_EXTENSIONS.pdf.has(ext)) {
    validatePdfMagic(filePath);
    if (imageKind) {
      throw new Error('File content does not match PDF format.');
    }
    return { kind: 'pdf', extension: EXTENSION_BY_KIND.pdf, fileType: 'pdf' };
  }

  if (NOTE_ALLOWED_EXTENSIONS.docx.has(ext)) {
    validateDocxMagic(filePath);
    if (imageKind) {
      throw new Error('File content does not match DOCX format.');
    }
    return { kind: 'docx', extension: EXTENSION_BY_KIND.docx, fileType: 'docx' };
  }

  if (NOTE_ALLOWED_EXTENSIONS.jpeg.has(ext) || NOTE_ALLOWED_EXTENSIONS.png.has(ext)) {
    if (!imageKind || (imageKind !== 'jpeg' && imageKind !== 'png')) {
      throw new Error('File must be a JPG or PNG image.');
    }
    if (imageKind === 'jpeg' && !NOTE_ALLOWED_EXTENSIONS.jpeg.has(ext)) {
      throw new Error('File extension must match image content.');
    }
    if (imageKind === 'png' && !NOTE_ALLOWED_EXTENSIONS.png.has(ext)) {
      throw new Error('File extension must match image content.');
    }
    const mime = String(claimedMime || '').toLowerCase();
    if (mime && !/^image\/(jpe?g|png)$/.test(mime)) {
      throw new Error('File must be a JPG or PNG image.');
    }
    return {
      kind: imageKind,
      extension: EXTENSION_BY_KIND[imageKind],
      fileType: 'image',
    };
  }

  throw new Error('Unsupported file type. Allowed: PDF, JPG, PNG, or DOCX.');
}

/** @param {string} fileUrl */
export function resolveStoredNoteFilename(fileUrl) {
  const base = path.basename(String(fileUrl || '').split('?')[0]);
  if (!/^[a-f0-9]{48}\.(pdf|jpg|jpeg|png|docx)$/i.test(base)) return null;
  return base;
}

/** @param {'pdf'|'image'|'docx'} fileType */
export function contentTypeForNoteFileType(fileType, filename = '') {
  const ext = path.extname(filename).toLowerCase();
  if (fileType === 'pdf' || ext === '.pdf') return 'application/pdf';
  if (fileType === 'docx' || ext === '.docx') {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  if (ext === '.png') return 'image/png';
  return 'image/jpeg';
}
