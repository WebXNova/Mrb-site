import fs from 'fs';

const JPEG = Buffer.from([0xff, 0xd8, 0xff]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const WEBP_RIFF = Buffer.from([0x52, 0x49, 0x46, 0x46]);
const WEBP_MAGIC = Buffer.from([0x57, 0x45, 0x42, 0x50]);

function startsWith(buf, prefix) {
  if (buf.length < prefix.length) return false;
  return buf.subarray(0, prefix.length).equals(prefix);
}

/**
 * @param {string} filePath absolute path on disk
 * @returns {'jpeg'|'png'|'webp'|null}
 */
export function detectImageKindFromFile(filePath) {
  const fd = fs.openSync(filePath, 'r');
  try {
    const buf = Buffer.alloc(16);
    const n = fs.readSync(fd, buf, 0, 16, 0);
    if (n < 12) return null;
    if (startsWith(buf, JPEG)) return 'jpeg';
    if (startsWith(buf, PNG)) return 'png';
    if (startsWith(buf, WEBP_RIFF) && n >= 12 && buf.subarray(8, 12).equals(WEBP_MAGIC)) return 'webp';
    return null;
  } finally {
    fs.closeSync(fd);
  }
}
