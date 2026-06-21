import { ApiError } from '../utils/apiError.js';
import { McqValidationError } from '../validation/mcq/McqValidationError.js';
import { assertValidMcqOptions } from '../validation/mcq/mcqValidation.engine.js';
import { MCQ_OPTION_KEY_ALPHABET, MCQ_OPTION_KEYS } from '../validation/mcq/mcqValidation.constants.js';

export { MCQ_OPTION_KEYS, MCQ_OPTION_KEY_ALPHABET };

function mapMcqErrorToApiError(error) {
  if (error instanceof McqValidationError) {
    const primary = error.issues[0];
    return new ApiError(422, primary.message, {
      code: primary.code,
      issues: error.issues,
    });
  }
  return error;
}

/**
 * Validate MCQ options before persistence (manual save / question bank writes).
 * Delegates to mcqValidation.engine — 2–10 options, one correct, no duplicates.
 *
 * @param {unknown} options
 * @param {{ context?: 'autosave' | 'manual_save' | 'publish' }} [config]
 */
export function validateOptions(options, config = {}) {
  try {
    const normalized = assertValidMcqOptions(options, {
      context: config.context ?? 'manual_save',
      pathPrefix: 'question',
      stripHtml: true,
    });
    return normalized.options;
  } catch (error) {
    throw mapMcqErrorToApiError(error);
  }
}

/**
 * Alias used by service layer before DB insert.
 * @param {unknown} options
 */
export function normalizeMcqOptionsForInsert(options) {
  return validateOptions(options, { context: 'manual_save' });
}
