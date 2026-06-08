import { ApiError } from '../utils/apiError.js';
import { sanitizeQuestionHtml } from '../utils/questionHtmlSanitizer.js';
import { normalizeOptionalQuestionImageUrl } from '../utils/questionImageUrlValidation.js';

function invalidQuestionContent(message, code) {
  return new ApiError(422, message, { code });
}

/**
 * Sanitize and validate Question Bank write payloads before persistence.
 *
 * @param {{
 *   question_text: string,
 *   explanation?: string|null,
 *   question_image_url?: string|null,
 *   options?: Array<{ option_text: string, is_correct: boolean, sort_order?: number, image_url?: string|null }>
 * }} payload
 */
export function applyQuestionWriteSecurity(payload) {
  const question_text = sanitizeQuestionHtml(payload.question_text);
  if (!question_text) {
    throw invalidQuestionContent('question_text is required', 'INVALID_QUESTION_TEXT');
  }

  let explanation = payload.explanation ?? null;
  if (explanation != null && String(explanation).trim() !== '') {
    explanation = sanitizeQuestionHtml(explanation);
    if (!explanation) {
      explanation = null;
    }
  } else {
    explanation = null;
  }

  let question_image_url = null;
  try {
    question_image_url = normalizeOptionalQuestionImageUrl(
      payload.question_image_url,
      'question_image_url'
    );
  } catch (error) {
    throw invalidQuestionContent(error.message, error.code || 'INVALID_QUESTION_IMAGE_URL');
  }

  const options = Array.isArray(payload.options)
    ? payload.options.map((option, index) => {
        let image_url = null;
        try {
          image_url = normalizeOptionalQuestionImageUrl(option.image_url, `options.${index}.image_url`);
        } catch (error) {
          throw invalidQuestionContent(error.message, error.code || 'INVALID_OPTION_IMAGE_URL');
        }
        return {
          ...option,
          image_url,
        };
      })
    : payload.options;

  return {
    ...payload,
    question_text,
    explanation,
    question_image_url,
    options,
  };
}
