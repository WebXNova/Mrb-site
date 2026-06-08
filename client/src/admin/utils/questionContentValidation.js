import DOMPurify from 'dompurify';
import { validateQuestionImageUrl } from './questionImageUrlValidation.js';

export function createDefaultQuestionContentForm() {
  return {
    questionTextHtml: '',
    questionImageUrl: '',
    questionImageSource: 'none',
  };
}

/**
 * Plain-text probe for required question body (HTML stored separately).
 * @param {string} html
 */
export function questionTextPlainLength(html) {
  const plain = DOMPurify.sanitize(String(html ?? ''), { ALLOWED_TAGS: [] })
    .replace(/\u00a0/g, ' ')
    .trim();
  return plain.length;
}

export function isQuestionTextEmpty(html) {
  return questionTextPlainLength(html) === 0;
}

/**
 * @param {{ questionTextHtml?: string, questionImageUrl?: string, questionImageSource?: string }} form
 */
export function validateQuestionContent(form) {
  const fieldErrors = {};

  if (isQuestionTextEmpty(form.questionTextHtml)) {
    fieldErrors.questionTextHtml = 'Question text is required.';
  }

  const source = String(form.questionImageSource || 'none');
  const imageUrl = String(form.questionImageUrl || '').trim();
  if (source !== 'none' && imageUrl) {
    const imageCheck = validateQuestionImageUrl(imageUrl);
    if (!imageCheck.ok) {
      fieldErrors.questionImageUrl = imageCheck.message;
    }
  }

  return {
    valid: Object.keys(fieldErrors).length === 0,
    fieldErrors,
  };
}

export function isQuestionContentReady(form) {
  return validateQuestionContent(form).valid;
}
