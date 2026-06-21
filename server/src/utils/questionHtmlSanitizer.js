import sanitizeHtml from 'sanitize-html';
import { validateQuestionImageUrl } from './questionImageUrlValidation.js';
import { createQuestionHtmlOptions } from './sanitizeHtmlPolicy.js';

function sanitizeImgTag(tagName, attribs, allowArchivePaths = false) {
  const nextAttribs = {};
  const src = String(attribs.src || '').trim();
  if (src) {
    const validated = validateQuestionImageUrl(src, { allowArchivePaths });
    if (validated.ok) {
      nextAttribs.src = validated.url;
    }
  }
  if (attribs.alt != null && String(attribs.alt).trim() !== '') {
    nextAttribs.alt = String(attribs.alt).trim();
  }
  if (nextAttribs.src) {
    return { tagName, attribs: nextAttribs };
  }
  return false;
}

function sanitizeFigureTag(tagName, attribs) {
  const className = String(attribs.class || '').trim();
  if (className === 'table') {
    return { tagName, attribs: { class: 'table' } };
  }
  return false;
}

/**
 * @param {string} value
 * @param {{ allowArchivePaths?: boolean }} [options]
 * @returns {string}
 */
export function sanitizeQuestionHtml(value, options = {}) {
  const allowArchivePaths = Boolean(options.allowArchivePaths);
  return sanitizeHtml(String(value || ''), {
    ...createQuestionHtmlOptions(),
    transformTags: {
      img: (tagName, attribs) => sanitizeImgTag(tagName, attribs, allowArchivePaths),
      figure: sanitizeFigureTag,
    },
  }).trim();
}
