import fs from 'fs';

const WEBM_EBML = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);
const OGG_MAGIC = Buffer.from([0x4f, 0x67, 0x67, 0x53]);
const FTYP = Buffer.from([0x66, 0x74, 0x79, 0x70]);

function startsWith(buf, prefix) {
  if (buf.length < prefix.length) return false;
  return buf.subarray(0, prefix.length).equals(prefix);
}

/**
 * Detect audio container from on-disk magic bytes (never trust client MIME).
 *
 * @param {string} filePath
 * @returns {'webm'|'ogg'|'mp4'|null}
 */
export function detectAudioContainerFromFile(filePath) {
  const fd = fs.openSync(filePath, 'r');
  try {
    const buf = Buffer.alloc(16);
    const n = fs.readSync(fd, buf, 0, 16, 0);
    if (n < 4) return null;
    if (startsWith(buf, WEBM_EBML)) return 'webm';
    if (startsWith(buf, OGG_MAGIC)) return 'ogg';
    if (n >= 8 && buf.subarray(4, 8).equals(FTYP)) return 'mp4';
    return null;
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * @param {'webm'|'ogg'|'mp4'} kind
 */
export function extensionForAudioContainer(kind) {
  if (kind === 'webm') return '.webm';
  if (kind === 'ogg') return '.ogg';
  if (kind === 'mp4') return '.m4a';
  return null;
}
