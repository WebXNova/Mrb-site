/** Shared Q&A word rules (student questions + teacher answers). */
export const MIN_WORDS_TEXT_ONLY = 3;
export const MIN_WORDS_WITH_MEDIA = 3;
export const MIN_QUESTION_CHARS = 1;
export const MIN_ANSWER_CHARS = 1;

/** Placeholder body for teacher-initiated chat rows (hidden in UI). */
export const TEACHER_INITIATED_PLACEHOLDER_BODY = 'Continuing our chat';

export function countWords(text) {
  return String(text || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

export function minWordsRequired(hasAttachment) {
  return hasAttachment ? MIN_WORDS_WITH_MEDIA : MIN_WORDS_TEXT_ONLY;
}

export function meetsQaTextWordRules(body, hasAttachment) {
  const trimmed = String(body || '').trim();
  const words = countWords(trimmed);

  if (hasAttachment && !trimmed) return true;
  if (!trimmed && !hasAttachment) return false;

  return words >= minWordsRequired(hasAttachment);
}

export function validateStudentQuestionWords(body, hasMedia) {
  const trimmed = String(body || '').trim();
  if (!trimmed && !hasMedia) {
    return { ok: false, message: 'Message text cannot be empty.', code: 'EMPTY_QUESTION' };
  }
  if (!meetsQaTextWordRules(trimmed, hasMedia)) {
    const words = countWords(trimmed);
    const minWords = minWordsRequired(hasMedia);
    return {
      ok: false,
      message: hasMedia && !trimmed
        ? ''
        : `Please write at least ${minWords} words (you have ${words}).`,
      code: 'INSUFFICIENT_WORD_COUNT',
    };
  }
  return { ok: true };
}

export function validateTeacherAnswerWords(body, hasMedia) {
  const trimmed = String(body || '').trim();
  if (!trimmed && !hasMedia) {
    return { ok: false, message: 'Message text is required.', code: 'ANSWER_EMPTY' };
  }
  if (!meetsQaTextWordRules(trimmed, hasMedia)) {
    const words = countWords(trimmed);
    const minWords = minWordsRequired(hasMedia);
    return {
      ok: false,
      message: `Please write at least ${minWords} words (you have ${words}).`,
      code: 'INSUFFICIENT_WORD_COUNT',
    };
  }
  return { ok: true };
}

export function isTeacherInitiatedBody(body) {
  return String(body || '').trim() === TEACHER_INITIATED_PLACEHOLDER_BODY;
}
