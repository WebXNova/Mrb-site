import {
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  MAX_RECORDING_BYTES,
  MAX_RECORDING_SECONDS,
  MIN_ANSWER_WORDS,
  countWords,
  meetsQuestionWordRules,
  validateQuestionImageFile,
  validateRecordedAudioBlob,
} from '../../utils/qaQuestionValidation';

export const MIN_ANSWER_CHARS = 1;
export const MAX_ANSWER_CHARS = 5000;
export { MIN_ANSWER_WORDS } from '../../utils/qaQuestionValidation';

export {
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  MAX_RECORDING_BYTES,
  MAX_RECORDING_SECONDS,
  validateRecordedAudioBlob,
};

export function validateTeacherAnswerLength(body, hasMedia = false) {
  const trimmed = String(body || '').trim();
  if (!trimmed && !hasMedia) return 'Write a message to send.';
  if (!meetsQuestionWordRules(trimmed, hasMedia)) {
    const words = countWords(trimmed);
    return `Write at least ${MIN_ANSWER_WORDS} words (you have ${words}).`;
  }
  if (trimmed.length > MAX_ANSWER_CHARS) {
    return `Message must be ${MAX_ANSWER_CHARS.toLocaleString()} characters or fewer.`;
  }
  return '';
}

export function validateTeacherAnswerImageFile(file) {
  return validateQuestionImageFile(file);
}

export function meetsTeacherAnswerRules(body, hasMedia = false) {
  return !validateTeacherAnswerLength(body, hasMedia);
}
