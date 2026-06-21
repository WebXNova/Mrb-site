import fs from 'fs';
import path from 'path';
import { parseFile, parseBuffer } from 'music-metadata';
import {
  detectAudioContainerFromFile,
  extensionForAudioContainer,
} from './audioMagicBytes.js';

const ALLOWED_EXTENSIONS = Object.freeze({
  webm: new Set(['.webm']),
  ogg: new Set(['.ogg']),
  mp4: new Set(['.m4a', '.mp4']),
});

const BLOCKED_EXTENSIONS = new Set([
  '.zip',
  '.rar',
  '.7z',
  '.svg',
  '.gif',
  '.pdf',
  '.exe',
  '.js',
  '.html',
  '.htm',
  '.php',
  '.phtml',
  '.mp3',
  '.wav',
  '.flac',
  '.aac',
  '.wma',
  '.avi',
  '.mkv',
  '.mov',
]);

const ALLOWED_MIME_BY_KIND = Object.freeze({
  webm: new Set(['audio/webm', 'video/webm']),
  ogg: new Set(['audio/ogg', 'application/ogg']),
  mp4: new Set(['audio/mp4', 'audio/m4a', 'audio/x-m4a', 'video/mp4']),
});

/** Codecs permitted per detected container kind. */
const ALLOWED_CODECS_BY_KIND = Object.freeze({
  webm: new Set(['opus', 'vorbis']),
  ogg: new Set(['opus', 'vorbis']),
  mp4: new Set(['aac', 'mp4a.40.2', 'mp4a.40.5', 'mpeg-4/aac', 'aac lc']),
});

const DANGEROUS_MARKERS = Object.freeze([
  Buffer.from('<?php'),
  Buffer.from('<script'),
  Buffer.from('<html'),
  Buffer.from('%PDF'),
]);

/** File-type confusion at the very start of the upload (before container magic). */
const EARLY_FILE_SIGNATURE_MARKERS = Object.freeze([
  Buffer.from('PK\x03\x04'),
  Buffer.from('MZ'),
]);

const POLYGLOT_EARLY_SCAN_BYTES = 1024;
const POLYGLOT_TRAILING_SCAN_BYTES = 8192;

const MIN_VALID_BYTES = 256;

/**
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
export function normalizeAudioUploadExtension(originalName) {
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
 * @param {string} filePath
 * @param {number} maxBytes
 */
function readScanBuffer(filePath, maxBytes) {
  const stat = fs.statSync(filePath);
  const scanLen = Math.min(stat.size, maxBytes);
  if (scanLen <= 0) return Buffer.alloc(0);

  const fd = fs.openSync(filePath, 'r');
  try {
    const buf = Buffer.alloc(scanLen);
    const n = fs.readSync(fd, buf, 0, scanLen, 0);
    return buf.subarray(0, n);
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * Scan only header-adjacent and trailing regions — not the full compressed payload.
 * Short markers (e.g. "<?", "MZ") produce frequent false positives inside Opus/WebM binary.
 *
 * @param {Buffer} buf
 */
function readAudioPolyglotRegions(buf) {
  if (!buf?.length) {
    return { earlyRegion: Buffer.alloc(0), trailingRegion: Buffer.alloc(0), fileStart: Buffer.alloc(0) };
  }
  const earlyEnd = Math.min(buf.length, POLYGLOT_EARLY_SCAN_BYTES);
  const earlyRegion = buf.subarray(4, earlyEnd);
  const trailingStart = Math.max(0, buf.length - POLYGLOT_TRAILING_SCAN_BYTES);
  const trailingRegion = buf.subarray(trailingStart);
  const fileStart = buf.subarray(0, Math.min(4, buf.length));
  return { earlyRegion, trailingRegion, fileStart };
}

function containsDangerousMarker(earlyRegion, trailingRegion, fileStart) {
  for (const marker of EARLY_FILE_SIGNATURE_MARKERS) {
    if (fileStart.length >= marker.length && fileStart.subarray(0, marker.length).equals(marker)) {
      return marker.toString('utf8', 0, Math.min(marker.length, 16));
    }
  }
  for (const marker of DANGEROUS_MARKERS) {
    if (earlyRegion.includes(marker)) {
      return marker.toString('utf8', 0, Math.min(marker.length, 16));
    }
    if (trailingRegion.includes(marker)) {
      return marker.toString('utf8', 0, Math.min(marker.length, 16));
    }
  }
  return null;
}

function normalizeCodec(codec) {
  return String(codec || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function codecAllowed(kind, codec) {
  const normalized = normalizeCodec(codec);
  if (!normalized) return false;
  const allowed = ALLOWED_CODECS_BY_KIND[kind];
  if (allowed.has(normalized)) return true;
  if (kind === 'webm' || kind === 'ogg') {
    return normalized.includes('opus') || normalized.includes('vorbis');
  }
  if (kind === 'mp4') {
    return normalized.includes('aac') || normalized.includes('mp4a');
  }
  return false;
}

function estimateDurationFromFileSize(actualSize, minDurationSec, maxDurationSec) {
  const minBps = 12_000;
  const maxBps = 160_000;
  const impliedShort = (actualSize * 8) / maxBps;
  const impliedLong = (actualSize * 8) / minBps;

  if (impliedShort > maxDurationSec + 0.5) {
    return { ok: false, code: 'AUDIO_TOO_LONG', durationSec: impliedShort };
  }
  if (impliedLong < minDurationSec) {
    return { ok: false, code: 'AUDIO_TOO_SHORT', durationSec: impliedLong };
  }

  return {
    ok: true,
    durationSec: Math.min(maxDurationSec, Math.max(minDurationSec, impliedShort)),
  };
}

function containerMatchesKind(parsedContainer, kind) {
  const c = String(parsedContainer || '').toLowerCase();
  if (kind === 'webm') return c.includes('webm') || c.includes('matroska');
  if (kind === 'ogg') return c.includes('ogg');
  if (kind === 'mp4') return c.includes('mpeg') || c.includes('mp4') || c.includes('iso');
  return false;
}

/**
 * Validate Q&A voice recording using magic bytes, container parse, codec allowlist, and server-side duration.
 * Never trusts client MIME, duration, or recorder headers for acceptance.
 *
 * @param {{
 *   filePath: string,
 *   originalName?: string,
 *   claimedMime?: string,
 *   size?: number,
 *   maxBytes?: number,
 *   maxDurationSec?: number,
 *   minDurationSec?: number,
 * }}
 */
export async function validateSecureAudioUpload({
  filePath,
  originalName = '',
  claimedMime = '',
  size,
  maxBytes = 10 * 1024 * 1024,
  maxDurationSec = 120,
  minDurationSec = 1,
}) {
  const stat = fs.statSync(filePath);
  const actualSize = stat.size;

  if (actualSize < MIN_VALID_BYTES) {
    throw Object.assign(new Error('Recording file is too small or truncated.'), {
      code: 'AUDIO_TRUNCATED',
      size: actualSize,
    });
  }

  if (size != null && size !== actualSize) {
    throw Object.assign(new Error('Recording size mismatch.'), {
      code: 'AUDIO_SIZE_MISMATCH',
      claimed: size,
      actual: actualSize,
    });
  }

  if (actualSize > maxBytes) {
    throw Object.assign(new Error('Recording exceeds maximum allowed size.'), {
      code: 'AUDIO_TOO_LARGE',
      size: actualSize,
    });
  }

  const extResult = normalizeAudioUploadExtension(originalName);
  if (!extResult.ok) {
    throw Object.assign(new Error('Recording type is not allowed.'), {
      code: 'BLOCKED_EXTENSION',
      ext: extResult.ext,
      reason: extResult.reason,
    });
  }

  const kind = detectAudioContainerFromFile(filePath);
  if (!kind) {
    throw Object.assign(new Error('Recording content is not a supported audio format.'), {
      code: 'INVALID_SIGNATURE',
    });
  }

  const allowedExts = ALLOWED_EXTENSIONS[kind];
  if (!extResult.ext || !allowedExts.has(extResult.ext)) {
    throw Object.assign(new Error('Recording extension does not match audio content.'), {
      code: 'EXTENSION_SIGNATURE_MISMATCH',
      ext: extResult.ext,
      kind,
    });
  }

  const scanBuffer = readScanBuffer(filePath, maxBytes);
  const { earlyRegion, trailingRegion, fileStart } = readAudioPolyglotRegions(scanBuffer);
  const dangerous = containsDangerousMarker(earlyRegion, trailingRegion, fileStart);
  if (dangerous) {
    throw Object.assign(new Error('Recording contains disallowed embedded content.'), {
      code: 'POLYGLOT_REJECTED',
      marker: dangerous,
    });
  }

  let metadata;
  const parseOptions = { duration: true, skipCovers: true };
  try {
    metadata = await parseFile(filePath, parseOptions);
  } catch (error) {
    if (kind === 'webm' && actualSize >= 512) {
      try {
        const buffer = fs.readFileSync(filePath);
        metadata = await parseBuffer(buffer, { ...parseOptions, mimeType: 'audio/webm' });
      } catch (bufferError) {
        throw Object.assign(new Error('Recording could not be parsed (malformed or truncated).'), {
          code: 'AUDIO_PARSE_FAILED',
          cause: bufferError ?? error,
        });
      }
    } else {
      throw Object.assign(new Error('Recording could not be parsed (malformed or truncated).'), {
        code: 'AUDIO_PARSE_FAILED',
        cause: error,
      });
    }
  }

  const format = metadata.format || {};
  const parsedContainer = String(format.container || '').trim();

  let codec = normalizeCodec(format.codec);
  if (!codec && kind === 'webm') {
    const containerHint = String(format.container || '').toLowerCase();
    const hasAudioTrack = metadata.trackInfo?.some((t) => t.type === 'audio');
    if (containerHint.includes('webm') || containerHint.includes('matroska') || hasAudioTrack) {
      codec = 'opus';
    }
  }

  let durationSec = Number(format.duration);

  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    const bitrate = Number(format.bitrate);
    if (Number.isFinite(bitrate) && bitrate > 0) {
      durationSec = (actualSize * 8) / bitrate;
    }
  }

  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    const hasAudioHint =
      Boolean(metadata.trackInfo?.find((t) => t.type === 'audio')) ||
      codecAllowed(kind, codec) ||
      (kind === 'webm' && containerMatchesKind(parsedContainer, kind));

    if (hasAudioHint && (kind === 'webm' || kind === 'ogg')) {
      const estimate = estimateDurationFromFileSize(actualSize, minDurationSec, maxDurationSec);
      if (!estimate.ok) {
        throw Object.assign(
          new Error(
            estimate.code === 'AUDIO_TOO_LONG'
              ? 'Recording exceeds maximum allowed duration.'
              : 'Recording is too short.'
          ),
          { code: estimate.code, durationSec: estimate.durationSec }
        );
      }
      durationSec = estimate.durationSec;
    } else {
      throw Object.assign(new Error('Recording duration could not be verified.'), {
        code: 'AUDIO_DURATION_UNKNOWN',
      });
    }
  }

  if (durationSec < minDurationSec) {
    throw Object.assign(new Error('Recording is too short.'), {
      code: 'AUDIO_TOO_SHORT',
      durationSec,
    });
  }

  if (durationSec > maxDurationSec + 0.5) {
    throw Object.assign(new Error('Recording exceeds maximum allowed duration.'), {
      code: 'AUDIO_TOO_LONG',
      durationSec,
    });
  }

  if (parsedContainer && !containerMatchesKind(parsedContainer, kind)) {
    throw Object.assign(new Error('Recording container does not match file signature.'), {
      code: 'CONTAINER_MISMATCH',
      expected: kind,
      actual: format.container,
    });
  }

  if (!codecAllowed(kind, codec)) {
    throw Object.assign(new Error('Recording codec is not allowed.'), {
      code: 'CODEC_NOT_ALLOWED',
      codec,
      kind,
    });
  }

  const audioTrack = metadata.trackInfo?.find((t) => t.type === 'audio');
  // Browser MediaRecorder WebM may omit trackInfo; rely on magic bytes + codec when absent.
  if (metadata.trackInfo?.length > 0 && !audioTrack) {
    throw Object.assign(new Error('Recording has no audio track.'), { code: 'NO_AUDIO_TRACK' });
  }

  const normalizedMime = String(claimedMime || '').trim().toLowerCase();
  const allowedMime = ALLOWED_MIME_BY_KIND[kind];
  const mimeMismatch = normalizedMime !== '' && !allowedMime.has(normalizedMime);

  const extension = extensionForAudioContainer(kind);
  if (!extension) {
    throw Object.assign(new Error('Unsupported audio container.'), { code: 'INVALID_KIND' });
  }

  return {
    kind,
    extension,
    durationSec: Math.min(maxDurationSec, Math.max(minDurationSec, Math.round(durationSec))),
    codec,
    mimeMismatch,
    sizeBytes: actualSize,
  };
}
