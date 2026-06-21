import { MCQ_ERROR_CODES, MCQ_MAX_OPTIONS, MCQ_MIN_OPTIONS } from './mcqValidation.constants.js';

const MESSAGE_TEMPLATES = Object.freeze({
  [MCQ_ERROR_CODES.QUESTION_TEXT_REQUIRED]: 'Question text is required.',
  [MCQ_ERROR_CODES.OPTIONS_NOT_ARRAY]: 'MCQ options must be an array.',
  [MCQ_ERROR_CODES.INVALID_OPTION_COUNT]: `MCQ must have between ${MCQ_MIN_OPTIONS} and ${MCQ_MAX_OPTIONS} options.`,
  [MCQ_ERROR_CODES.INVALID_OPTION_SHAPE]: 'Each MCQ option must be an object.',
  [MCQ_ERROR_CODES.EMPTY_OPTION_TEXT]: 'Option text cannot be empty.',
  [MCQ_ERROR_CODES.DUPLICATE_OPTION_TEXT]: 'Duplicate option text is not allowed.',
  [MCQ_ERROR_CODES.DUPLICATE_OPTION_KEY]: 'Duplicate option keys are not allowed.',
  [MCQ_ERROR_CODES.INVALID_OPTION_KEY]: 'Option key is invalid for MCQ.',
  [MCQ_ERROR_CODES.NO_CORRECT_OPTION]: 'Exactly one option must be marked as correct.',
  [MCQ_ERROR_CODES.MULTIPLE_CORRECT_OPTIONS]: 'Only one option may be marked as correct.',
  [MCQ_ERROR_CODES.INVALID_QUESTION_IMAGE_URL]: 'Question image URL is invalid.',
  [MCQ_ERROR_CODES.INVALID_OPTION_IMAGE_URL]: 'Option image URL is invalid.',
});

/**
 * @param {string} code
 * @param {{ field?: string, optionIndex?: number, optionKey?: string, duplicateIndex?: number, imageCode?: string }} [detail]
 */
export function mcqErrorMessage(code, detail = {}) {
  const base = MESSAGE_TEMPLATES[code] || 'MCQ validation failed.';
  const field = detail.field ? ` (${detail.field})` : '';
  const option =
    detail.optionIndex != null
      ? ` Option ${detail.optionIndex + 1}${detail.optionKey ? ` (${detail.optionKey})` : ''}:`
      : '';
  const duplicate =
    detail.duplicateIndex != null ? ` Duplicates option at index ${detail.duplicateIndex}.` : '';
  const image = detail.imageCode ? ` [${detail.imageCode}]` : '';
  return `${base}${field}${option}${duplicate}${image}`.trim();
}

/**
 * @param {string} code
 * @param {Record<string, unknown>} [detail]
 */
export function buildMcqValidationIssue(code, detail = {}) {
  return {
    code,
    message: mcqErrorMessage(code, detail),
    ...detail,
  };
}
