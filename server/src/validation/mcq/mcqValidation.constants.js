/** MCQ structural limits — single source of truth for LMS validation (aligned with DB max 4). */
export const MCQ_MIN_OPTIONS = 2;
export const MCQ_MAX_OPTIONS = 4;

/** Positional option keys for question_bank persistence (A–J). */
export const MCQ_OPTION_KEY_ALPHABET = Object.freeze([
  'A',
  'B',
  'C',
  'D',
  'E',
  'F',
  'G',
  'H',
  'I',
  'J',
]);

/** @deprecated Use MCQ_OPTION_KEY_ALPHABET.slice(0, 4) — kept for legacy imports. */
export const MCQ_OPTION_KEYS = Object.freeze(MCQ_OPTION_KEY_ALPHABET.slice(0, 4));

/**
 * Validation contexts — same rules apply; used for audit metadata only.
 * @typedef {'autosave' | 'manual_save' | 'publish'} McqValidationContext
 */
export const MCQ_VALIDATION_CONTEXTS = Object.freeze(['autosave', 'manual_save', 'publish']);

export const MCQ_ERROR_CODES = Object.freeze({
  QUESTION_TEXT_REQUIRED: 'MCQ_QUESTION_TEXT_REQUIRED',
  OPTIONS_NOT_ARRAY: 'MCQ_OPTIONS_NOT_ARRAY',
  INVALID_OPTION_COUNT: 'MCQ_INVALID_OPTION_COUNT',
  INVALID_OPTION_SHAPE: 'MCQ_INVALID_OPTION_SHAPE',
  EMPTY_OPTION_TEXT: 'MCQ_EMPTY_OPTION_TEXT',
  DUPLICATE_OPTION_TEXT: 'MCQ_DUPLICATE_OPTION_TEXT',
  DUPLICATE_OPTION_KEY: 'MCQ_DUPLICATE_OPTION_KEY',
  INVALID_OPTION_KEY: 'MCQ_INVALID_OPTION_KEY',
  NO_CORRECT_OPTION: 'MCQ_NO_CORRECT_OPTION',
  MULTIPLE_CORRECT_OPTIONS: 'MCQ_MULTIPLE_CORRECT_OPTIONS',
  INVALID_QUESTION_IMAGE_URL: 'MCQ_INVALID_QUESTION_IMAGE_URL',
  INVALID_OPTION_IMAGE_URL: 'MCQ_INVALID_OPTION_IMAGE_URL',
});
