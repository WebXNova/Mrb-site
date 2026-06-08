import DOMPurify from 'dompurify';

/**
 * Frontend safety layer for CKEditor output.
 * CKEditor output is NEVER trusted.
 * Backend will re-validate content again.
 */

/** Aligned with server questionHtmlSanitizer allowlist + CKEditor table wrapper. */
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
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'blockquote',
  'figure',
];

const ALLOWED_ATTR = [
  'style',
  'class',
  'colspan',
  'rowspan',
  'align',
];

const FORBIDDEN_TAGS = ['script', 'iframe', 'svg', 'embed', 'object', 'form', 'link', 'style', 'base'];

const BLOCKED_URI_PATTERN = /^\s*javascript:/i;
const BLOCKED_DATA_URI_PATTERN = /^\s*data:/i;

let hooksRegistered = false;

function registerDomPurifyHooks() {
  if (hooksRegistered || typeof window === 'undefined') return;
  hooksRegistered = true;

  DOMPurify.addHook('uponSanitizeAttribute', (node, data) => {
    if (data.attrName === 'href' || data.attrName === 'src' || data.attrName === 'xlink:href') {
      const value = String(data.attrValue || '');
      if (BLOCKED_URI_PATTERN.test(value) || BLOCKED_DATA_URI_PATTERN.test(value)) {
        data.keepAttr = false;
      }
    }
    if (data.attrName === 'style') {
      const value = String(data.attrValue || '');
      if (/url\s*\(\s*javascript:/i.test(value) || /expression\s*\(/i.test(value)) {
        data.keepAttr = false;
      }
    }
  });
}

registerDomPurifyHooks();

/**
 * Strip/neutralize dangerous markup from CKEditor HTML.
 * This is a UI-layer guard — not a substitute for server sanitization.
 *
 * @param {string} html
 * @returns {string}
 */
export function sanitizeEditorOutput(html) {
  const raw = String(html ?? '');

  const cleaned = DOMPurify.sanitize(raw, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS: FORBIDDEN_TAGS,
    FORBID_CONTENTS: FORBIDDEN_TAGS,
  });

  return cleaned
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi, '')
    .replace(/<svg[\s\S]*?>[\s\S]*?<\/svg>/gi, '')
    .replace(/\s(href|src)\s*=\s*["']?\s*javascript:[^"'>\s]*/gi, '')
    .trim();
}
