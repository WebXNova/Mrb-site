import DOMPurify from 'dompurify';
import { validateImageUrl } from '../features/create-question/utils/image/validateImageUrl.js';
import {
  BLOCKED_URI_PATTERN,
  createRichHtmlDomPurifyConfig,
  stripResidualDangerousMarkup,
} from './richHtmlPolicy.js';

let hooksRegistered = false;

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
      if (attr === 'src' && node.tagName === 'IMG') {
        const check = validateImageUrl(value, { allowEmpty: true });
        if (!check.ok || !check.url) {
          data.keepAttr = false;
        } else {
          data.attrValue = check.url;
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
  const purified = DOMPurify.sanitize(String(html ?? ''), createRichHtmlDomPurifyConfig());
  return stripResidualDangerousMarkup(purified);
}
