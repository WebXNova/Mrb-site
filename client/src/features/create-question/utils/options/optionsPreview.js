import { OPTION_KEYS } from './optionKeys.js';
import { coerceOptionsIntegrity } from './mcqOptionsCorrectness.js';
import { sanitizeOptionText } from './sanitizeOptionText.js';

/**
 * @typedef {import('../../types/createQuestion.types.js').McqOptionsMap} McqOptionsMap
 */

/**
 * @param {McqOptionsMap} options
 */
export function optionsToPreviewList(options) {
  const coerced = coerceOptionsIntegrity(options);

  return OPTION_KEYS.map((key) => ({
    key,
    label: key,
    text: sanitizeOptionText(coerced[key]?.text ?? ''),
    imageUrl: coerced[key]?.image_url ?? '',
    isCorrect: Boolean(coerced[key]?.is_correct),
  }));
}
