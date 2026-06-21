/** Word counts for manual Q&A (aligned with server rules). */
export const MIN_WORDS_TEXT_ONLY = 3;
export const MIN_WORDS_WITH_IMAGE = 3;
export const MIN_WORDS_WITH_MEDIA = MIN_WORDS_WITH_IMAGE;
export const MIN_QUESTION_CHARS = 1;
export const MIN_ANSWER_WORDS = 3;
export const MAX_QUESTION_BODY_LENGTH = 2000;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_RECORDING_SECONDS = 120;
export const MAX_RECORDING_BYTES = 10 * 1024 * 1024;

/** Placeholder body for teacher-initiated chat rows (hidden in UI). */
export const TEACHER_INITIATED_PLACEHOLDER_BODY = 'Continuing our chat';

export const ALLOWED_IMAGE_TYPES = Object.freeze([
  'image/jpeg',
  'image/png',
  'image/webp',
]);
export const RECORDER_MIME_CANDIDATES = Object.freeze([
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/ogg',
  'audio/mp4',
]);

export function pickRecorderMimeType() {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return null;
  }
  for (const mime of RECORDER_MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return null;
}

export function countWords(text) {
  return String(text || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

export function minWordsRequired(hasAttachment) {
  return hasAttachment ? MIN_WORDS_WITH_MEDIA : MIN_WORDS_TEXT_ONLY;
}

export function meetsQuestionWordRules(body, hasAttachment) {
  const trimmed = String(body || '').trim();
  if (hasAttachment && !trimmed) return true;
  if (!trimmed && !hasAttachment) return false;
  return countWords(trimmed) >= minWordsRequired(hasAttachment);
}

export function validateQuestionBodyLength(body) {
  const trimmed = String(body || '').trim();
  if (trimmed.length > MAX_QUESTION_BODY_LENGTH) {
    return `Message must be ${MAX_QUESTION_BODY_LENGTH.toLocaleString()} characters or fewer.`;
  }
  return '';
}

export function validateQuestionImageFile(file) {
  if (!file) return '';
  const type = String(file.type || '').toLowerCase();
  if (!ALLOWED_IMAGE_TYPES.includes(type)) {
    return 'Please choose a JPEG, PNG, or WebP image.';
  }
  const name = String(file.name || '').toLowerCase();
  if (name.endsWith('.svg') || type === 'image/svg+xml') {
    return 'SVG images are not allowed.';
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return 'Image must be 5 MB or smaller.';
  }
  return '';
}

export function recordingExtensionFromBlobType(blobType) {
  const type = String(blobType || '').toLowerCase();
  if (type.includes('ogg')) return 'ogg';
  if (type.includes('mp4') || type.includes('m4a')) return 'm4a';
  return 'webm';
}

export function isAllowedRecordingBlobType(blobType) {
  const type = String(blobType || '').toLowerCase();
  if (!type) return true;
  return type.startsWith('audio/') || type === 'video/webm';
}

export function validateRecordedAudioBlob(blob, durationSec) {
  if (!blob) return '';
  const type = String(blob.type || '').toLowerCase();
  if (!isAllowedRecordingBlobType(type)) {
    return 'Invalid recording format.';
  }
  if (blob.size > MAX_RECORDING_BYTES) {
    return 'Recording must be 10 MB or smaller.';
  }
  if (durationSec > MAX_RECORDING_SECONDS) {
    return `Recording must be ${MAX_RECORDING_SECONDS / 60} minutes or shorter.`;
  }
  if (durationSec < 1) {
    return 'Recording is too short. Please record at least one second.';
  }
  return '';
}

export function isTeacherInitiatedBody(body) {
  return String(body || '').trim() === TEACHER_INITIATED_PLACEHOLDER_BODY;
}
