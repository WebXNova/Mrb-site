/**
 * Central sanitize-html policy for the LMS.
 *
 * Defense-in-depth for CVE-2026-44990 (<xmp> raw-text passthrough in <=2.17.3):
 * - Upgrade sanitize-html to >=2.17.4
 * - Explicit nonTextTags includes xmp (never rely on library defaults alone)
 *
 * All server-side sanitize-html call sites MUST import options from this module.
 */

/** @type {readonly string[]} */
export const NON_TEXT_TAGS = Object.freeze([
  'style',
  'script',
  'textarea',
  'option',
  'xmp',
  'noembed',
  'noframes',
  'iframe',
  'noscript',
]);

/** Tags allowed for Question Bank / test / result rich HTML (CKEditor output). */
export const QUESTION_ALLOWED_TAGS = Object.freeze([
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
]);

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

/** @type {Record<string, string[]>} */
export const QUESTION_ALLOWED_ATTRIBUTES = (() => {
  const attrs = {
    figure: ['class'],
    table: ['class'],
    td: ['colspan', 'rowspan', 'style'],
    th: ['colspan', 'rowspan', 'style'],
    img: ['src', 'alt', 'width', 'height'],
  };
  for (const tag of BLOCK_ELEMENTS_WITH_ALIGNMENT) {
    attrs[tag] = ['style', 'class'];
  }
  return attrs;
})();

export const QUESTION_ALLOWED_STYLES = Object.freeze({
  '*': {
    'text-align': [/^left$/i, /^right$/i, /^center$/i, /^justify$/i],
  },
});

/** @type {readonly string[]} */
export const QUESTION_ALLOWED_SCHEMES = Object.freeze(['http', 'https']);

/**
 * Hardened base options applied to every sanitize-html invocation.
 * @returns {import('sanitize-html').IOptions}
 */
export function createBaseSanitizeOptions() {
  return {
    nonTextTags: [...NON_TEXT_TAGS],
    disallowedTagsMode: 'discard',
    enforceHtmlBoundary: true,
    allowProtocolRelative: false,
    parseStyleAttributes: true,
  };
}

/**
 * Strip all HTML — plain text fields (Q&A body, titles, search probes).
 * @returns {import('sanitize-html').IOptions}
 */
export function createStripHtmlOptions() {
  return {
    ...createBaseSanitizeOptions(),
    allowedTags: [],
    allowedAttributes: {},
  };
}

/**
 * Rich educational HTML — question stems, explanations, options (server write + API output).
 * Transform hooks (img, figure) are applied by questionHtmlSanitizer.
 * @returns {import('sanitize-html').IOptions}
 */
export function createQuestionHtmlOptions() {
  return {
    ...createBaseSanitizeOptions(),
    allowedTags: [...QUESTION_ALLOWED_TAGS],
    allowedAttributes: { ...QUESTION_ALLOWED_ATTRIBUTES },
    allowedStyles: { ...QUESTION_ALLOWED_STYLES },
    allowedSchemes: [...QUESTION_ALLOWED_SCHEMES],
  };
}
