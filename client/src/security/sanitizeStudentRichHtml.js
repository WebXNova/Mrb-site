import DOMPurify from 'dompurify';
import {
  BLOCKED_URI_PATTERN,
  createRichHtmlDomPurifyConfig,
  stripResidualDangerousMarkup,
} from './richHtmlPolicy.js';

/** @type {RegExp} matches `![alt](url)` or `![alt](url "title")` */
const MARKDOWN_IMAGE_RE = /!\[([^\]]*)\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g;

let hooksRegistered = false;

/**
 * Convert Markdown image syntax `![alt](url)` to HTML `<img>` tags.
 * Must run before DOMPurify so the resulting `<img>` tags are sanitized.
 */
function convertMarkdownImages(html) {
  return String(html ?? '').replace(MARKDOWN_IMAGE_RE, (_match, alt, url) => {
    const safeAlt = String(alt ?? '').trim();
    const safeUrl = String(url ?? '').trim();
    if (!safeUrl) return _match;
    const escapedAlt = safeAlt.replace(/"/g, '&quot;');
    const escapedUrl = safeUrl.replace(/"/g, '&quot;');
    return `<img src="${escapedUrl}" alt="${escapedAlt}" />`;
  });
}

function registerStudentRichHtmlHooks() {
  if (hooksRegistered || typeof window === 'undefined') return;
  hooksRegistered = true;

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
        return;
      }
      if (attr === 'src' && node.tagName === 'IMG' && value.trim()) {
        if (/[\s<>"']/.test(value) || value.includes('..')) {
          data.keepAttr = false;
        }
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

registerStudentRichHtmlHooks();

/**
 * Sanitize rich HTML before dangerouslySetInnerHTML on student-facing surfaces.
 * Server already sanitizes on write/output — this is mandatory defense-in-depth.
 *
 * @param {string} html
 * @returns {string}
 */
export function sanitizeStudentRichHtml(html) {
  const withImages = convertMarkdownImages(String(html ?? ''));
  const purified = DOMPurify.sanitize(withImages, createRichHtmlDomPurifyConfig());
  return stripResidualDangerousMarkup(purified);
}
