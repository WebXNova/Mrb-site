import { normalizeAudioUploadExtension } from './secureAudioValidation.js';

/** Pre-multer gate — final acceptance uses magic bytes + parse in validateSecureAudioUpload. */
const ALLOWED_MIME = /^(audio\/(webm|ogg|mp4|m4a|mpeg|mp3)|video\/webm)(;.*)?$/i;

/**
 * Browser MediaRecorder often reports `video/webm` or `application/octet-stream`
 * even for audio-only Opus recordings; allow when extension is valid.
 *
 * @param {string|undefined|null} mimetype
 * @param {string|undefined|null} originalName
 */
export function isAllowedQaAudioUploadMime(mimetype, originalName) {
  const mime = String(mimetype || '').trim();
  if (ALLOWED_MIME.test(mime)) return true;
  if (!mime || mime === 'application/octet-stream') {
    const extResult = normalizeAudioUploadExtension(originalName || '');
    return extResult.ok && Boolean(extResult.ext);
  }
  return false;
}

export function qaAudioUploadMimeRejectionMessage() {
  return 'Only WebM, OGG, M4A, or MP3 voice recordings are allowed';
}
