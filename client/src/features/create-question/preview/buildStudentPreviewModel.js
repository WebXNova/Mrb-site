import { sanitizeExplanationHtml } from '../utils/sanitizeExplanationHtml.js';
import { validateQuestionContent } from '../utils/validation/validateQuestionContent.js';
import { parseQuestionPreviewBlocks } from '../utils/preview/parseQuestionPreviewBlocks.js';
import { optionsToPreviewList } from '../utils/options/optionsPreview.js';
import { resolveOptionImagePreviewSrc } from '../utils/image/imagePreviewUrl.js';

/**
 * @typedef {import('../types/studentPreview.types.js').StudentPreviewModel} StudentPreviewModel
 * @typedef {import('../types/studentPreview.types.js').StudentPreviewOption} StudentPreviewOption
 */

/**
 * Pure preview builder — transforms authoring state into a sanitized student-view DTO.
 * Never passes raw editor HTML to renderers.
 *
 * @param {object} input
 * @param {import('../types/createQuestion.types.js').QuestionBody} input.question
 * @param {import('../types/createQuestion.types.js').McqOptionsMap} input.options
 * @param {import('../types/explanation.contract.js').ExplanationAuthoringState} input.explanation
 * @returns {StudentPreviewModel}
 */
export function buildStudentPreviewModel({ question, options, explanation }) {
  const questionRaw = question.textHtmlDraft || question.textPlain || '';
  const questionValidation = validateQuestionContent(questionRaw);
  const questionBlocks = parseQuestionPreviewBlocks(questionValidation.sanitizedHtml);

  const explanationRaw = explanation.textHtmlDraft || explanation.textPlain || '';
  const explanationSanitized = explanationRaw ? sanitizeExplanationHtml(explanationRaw) : '';
  const explanationBlocks = explanationSanitized
    ? parseQuestionPreviewBlocks(explanationSanitized)
    : [];

  /** @type {StudentPreviewOption[]} */
  const previewOptions = optionsToPreviewList(options).map((opt) => ({
    key: opt.key,
    label: opt.label,
    text: opt.text,
    imagePreviewSrc: opt.imageUrl ? resolveOptionImagePreviewSrc(opt.imageUrl) : '',
    hasImage: Boolean(opt.imageUrl && resolveOptionImagePreviewSrc(opt.imageUrl)),
  }));

  return {
    question: {
      blocks: questionBlocks,
      isEmpty: questionBlocks.length === 0,
    },
    options: previewOptions,
    explanation: {
      blocks: explanationBlocks,
      isEmpty: explanationBlocks.length === 0,
    },
    meta: {
      builtAt: Date.now(),
      questionCharCount: questionValidation.plainText.length,
    },
  };
}
