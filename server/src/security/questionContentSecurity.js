import { ApiError } from '../utils/apiError.js';
import { sanitizeQuestionHtml } from '../utils/questionHtmlSanitizer.js';
import { isSemanticallyEmptyHtml } from '../utils/semanticHtmlContent.js';
import { normalizeOptionalQuestionImageUrl } from '../utils/questionImageUrlValidation.js';
import { attachRichHtmlMirrorFields } from '../utils/richHtmlContent.js';

function invalidQuestionContent(message, code) {
  return new ApiError(422, message, { code });
}

/**
 * @param {{
 *   question_text: string,
 *   explanation?: string|null,
 *   question_image_url?: string|null,
 *   options?: Array<{ option_text: string, is_correct: boolean, sort_order?: number, image_url?: string|null }>
 * }} payload
 * @param {{ allowArchivePaths?: boolean }} [options]
 */
export function applyQuestionWriteSecurity(payload, securityOptions = {}) {
  const allowArchivePaths = Boolean(securityOptions.allowArchivePaths);
  const question_text = sanitizeQuestionHtml(payload.question_text, { allowArchivePaths });
  if (isSemanticallyEmptyHtml(question_text, { sanitize: false })) {
    throw invalidQuestionContent('question_text is required', 'INVALID_QUESTION_TEXT');
  }

  let explanation = payload.explanation ?? null;
  if (explanation != null && String(explanation).trim() !== '') {
    explanation = sanitizeQuestionHtml(explanation, { allowArchivePaths });
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
      'question_image_url',
      { allowArchivePaths }
    );
  } catch (error) {
    throw invalidQuestionContent(error.message, error.code || 'INVALID_QUESTION_IMAGE_URL');
  }

  const options = Array.isArray(payload.options)
    ? payload.options.map((option, index) => {
        const option_text = sanitizeQuestionHtml(option.option_text, { allowArchivePaths });
        if (isSemanticallyEmptyHtml(option_text, { sanitize: false })) {
          throw invalidQuestionContent(`options.${index}.option_text is required`, 'INVALID_OPTION_TEXT');
        }

        let image_url = null;
        try {
          image_url = normalizeOptionalQuestionImageUrl(option.image_url, `options.${index}.image_url`, {
            allowArchivePaths,
          });
        } catch (error) {
          throw invalidQuestionContent(error.message, error.code || 'INVALID_OPTION_IMAGE_URL');
        }
        return {
          ...option,
          option_text,
          image_url,
        };
      })
    : payload.options;

  return attachRichHtmlMirrorFields({
    ...payload,
    question_text,
    explanation,
    question_image_url,
    options,
  });
}
