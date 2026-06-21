/**
 * Client-side rich HTML policy — aligned with server sanitizeHtmlPolicy.js / questionHtmlSanitizer.js.
 *
 * Used for defense-in-depth on student-visible render paths (test-taking, results)
 * and CKEditor output sanitization before submit.
 */

/** Educational formatting allowlist (CKEditor question bank). */
export const RICH_HTML_ALLOWED_TAGS = [
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
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'blockquote',
  'figure',
  'img',
];

export const RICH_HTML_ALLOWED_ATTR = [
  'style',
  'class',
  'colspan',
  'rowspan',
  'align',
  'src',
  'alt',
  'width',
  'height',
  'loading',
  'referrerpolicy',
];

/** CVE-2026-44990 + common XSS carriers — never allow in LMS rich content. */
export const RICH_HTML_FORBIDDEN_TAGS = [
  'script',
  'iframe',
  'svg',
  'math',
  'embed',
  'object',
  'form',
  'link',
  'style',
  'base',
  'meta',
  'xmp',
  'noembed',
  'noframes',
  'noscript',
  'template',
];

export const BLOCKED_URI_PATTERN = /^\s*(javascript|data|vbscript):/i;

/** Matches onclick=, onload=, onerror=, etc. */
export const INLINE_EVENT_HANDLER_PATTERN = /\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;

/**
 * @returns {import('dompurify').Config}
 */
export function createRichHtmlDomPurifyConfig() {
  return {
    ALLOWED_TAGS: RICH_HTML_ALLOWED_TAGS,
    ALLOWED_ATTR: RICH_HTML_ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS: RICH_HTML_FORBIDDEN_TAGS,
    FORBID_CONTENTS: RICH_HTML_FORBIDDEN_TAGS,
  };
}

/**
 * @returns {import('dompurify').Config}
 */
export function createPlainTextDomPurifyConfig() {
  return {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS: RICH_HTML_FORBIDDEN_TAGS,
    FORBID_CONTENTS: RICH_HTML_FORBIDDEN_TAGS,
  };
}

/**
 * Post-DOMPurify belt-and-suspenders strip for known bypass patterns.
 * @param {string} html
 */
export function stripResidualDangerousMarkup(html) {
  return String(html ?? '')
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi, '')
    .replace(/<svg[\s\S]*?>[\s\S]*?<\/svg>/gi, '')
    .replace(/<math[\s\S]*?>[\s\S]*?<\/math>/gi, '')
    .replace(/<xmp[\s\S]*?>[\s\S]*?<\/xmp>/gi, '')
    .replace(/<object[\s\S]*?>[\s\S]*?<\/object>/gi, '')
    .replace(/<embed[\s\S]*?>/gi, '')
    .replace(INLINE_EVENT_HANDLER_PATTERN, '')
    .replace(/\s(href|src|xlink:href)\s*=\s*["']?\s*(javascript|data|vbscript):[^"'>\s]*/gi, '')
    .trim();
}
