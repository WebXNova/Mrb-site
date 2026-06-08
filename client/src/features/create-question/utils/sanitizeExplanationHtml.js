import DOMPurify from 'dompurify';

/**
 * Explanation HTML sanitization — pre-submit and in-editor safety layer.
 *
 * Security rules:
 * - CKEditor / teacher input is NEVER trusted
 * - Never return raw editor output
 * - Backend re-validates on write (applyQuestionWriteSecurity)
 *
 * Removed tags: script, iframe, svg, object, embed
 * Rejected URL schemes: javascript:, data:, vbscript:
 * Stripped: inline event handlers (onclick, onload, onerror, …)
 */

/** Educational formatting allowlist — aligned with server questionHtmlSanitizer. */
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

const ALLOWED_ATTR = ['style', 'class', 'colspan', 'rowspan', 'align'];

const FORBIDDEN_TAGS = [
  'script',
  'iframe',
  'svg',
  'embed',
  'object',
  'form',
  'link',
  'style',
  'base',
  'meta',
];

const BLOCKED_URI_PATTERN = /^\s*(javascript|data|vbscript):/i;

/** Matches onclick=, onload=, onerror=, etc. */
const INLINE_EVENT_HANDLER_PATTERN = /\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;

let explanationHooksRegistered = false;

function registerExplanationDomPurifyHooks() {
  if (explanationHooksRegistered || typeof window === 'undefined') return;
  explanationHooksRegistered = true;

  DOMPurify.addHook('uponSanitizeAttribute', (node, data) => {
    const attr = String(data.attrName || '').toLowerCase();

    if (attr.startsWith('on')) {
      data.keepAttr = false;
      return;
    }

    if (attr === 'href' || attr === 'src' || attr === 'xlink:href') {
      const value = String(data.attrValue || '');
      if (BLOCKED_URI_PATTERN.test(value)) {
        data.keepAttr = false;
      }
    }

    if (attr === 'style') {
      const value = String(data.attrValue || '');
      if (
        /url\s*\(\s*javascript:/i.test(value) ||
        /url\s*\(\s*data:/i.test(value) ||
        /url\s*\(\s*vbscript:/i.test(value) ||
        /expression\s*\(/i.test(value)
      ) {
        data.keepAttr = false;
      }
    }
  });
}

registerExplanationDomPurifyHooks();

function stripDangerousMarkup(html) {
  return String(html ?? '')
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi, '')
    .replace(/<svg[\s\S]*?>[\s\S]*?<\/svg>/gi, '')
    .replace(/<object[\s\S]*?>[\s\S]*?<\/object>/gi, '')
    .replace(/<embed[\s\S]*?>/gi, '')
    .replace(INLINE_EVENT_HANDLER_PATTERN, '')
    .replace(/\s(href|src|xlink:href)\s*=\s*["']?\s*(javascript|data|vbscript):[^"'>\s]*/gi, '')
    .trim();
}

/**
 * Sanitize explanation HTML before storage or API submission.
 * Never returns raw editor output.
 *
 * @param {string} html — untrusted CKEditor output
 * @returns {string} safeHtml — sanitized HTML safe for draft state and submit payload
 */
export function sanitizeExplanationHtml(html) {
  const raw = String(html ?? '');

  const purified = DOMPurify.sanitize(raw, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS: FORBIDDEN_TAGS,
    FORBID_CONTENTS: FORBIDDEN_TAGS,
  });

  return stripDangerousMarkup(purified);
}
