/** Word counts for manual Q&A (aligned with server rules). */
export const MIN_WORDS_TEXT_ONLY = 10;
export const MIN_WORDS_WITH_IMAGE = 5;

export function countWords(text) {
  return String(text || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

export function minWordsRequired(hasAttachment) {
  return hasAttachment ? MIN_WORDS_WITH_IMAGE : MIN_WORDS_TEXT_ONLY;
}

export function meetsQuestionWordRules(body, hasAttachment) {
  const n = countWords(body);
  return n >= minWordsRequired(hasAttachment);
}
