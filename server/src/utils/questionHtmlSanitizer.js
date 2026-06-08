import sanitizeHtml from 'sanitize-html';
import { validateQuestionImageUrl } from './questionImageUrlValidation.js';

/**
 * Tags allowed for Question Bank CKEditor content (question_text, explanation).
 * Includes `figure` for CKEditor 5 table wrapper (`<figure class="table">`).
 */
const ALLOWED_TAGS = [
  'p',
  'br',
  'strong',
  'b',
  'em',
  'i',
  'u',
  'ul',
  'ol',
  'li',
  'table',
  'thead',
  'tbody',
  'tr',
  'td',
  'th',
  'sub',
  'sup',
  'span',
  'div',
  'img',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'blockquote',
  'figure',
];

const BLOCK_ELEMENTS_WITH_ALIGNMENT = [
  'p',
  'div',
  'span',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'blockquote',
  'td',
  'th',
];

const ALLOWED_ATTRIBUTES = {
  figure: ['class'],
  table: ['class'],
  td: ['colspan', 'rowspan', 'style'],
  th: ['colspan', 'rowspan', 'style'],
  img: ['src', 'alt', 'width', 'height'],
};

for (const tag of BLOCK_ELEMENTS_WITH_ALIGNMENT) {
  ALLOWED_ATTRIBUTES[tag] = ['style', 'class'];
}

const ALLOWED_STYLES = {
  '*': {
    'text-align': [/^left$/i, /^right$/i, /^center$/i, /^justify$/i],
  },
};

const ALLOWED_SCHEMES = ['http', 'https'];

function sanitizeImgTag(tagName, attribs) {
  const nextAttribs = {};
  const src = String(attribs.src || '').trim();
  if (src) {
    const validated = validateQuestionImageUrl(src);
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
 * Sanitize Question Bank HTML before any database write.
 * Strips scripts, event handlers, dangerous URLs, iframe/embed/object/svg, and unsafe styles.
 *
 * @param {string} value
 * @returns {string}
 */
export function sanitizeQuestionHtml(value) {
  return sanitizeHtml(String(value || ''), {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRIBUTES,
    allowedStyles: ALLOWED_STYLES,
    allowedSchemes: ALLOWED_SCHEMES,
    allowProtocolRelative: false,
    disallowedTagsMode: 'discard',
    enforceHtmlBoundary: true,
    transformTags: {
      img: sanitizeImgTag,
      figure: sanitizeFigureTag,
    },
  }).trim();
}
