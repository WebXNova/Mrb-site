import DOMPurify from 'dompurify';
import { validateImageUrl } from './image/validateImageUrl.js';
import {
  BLOCKED_URI_PATTERN,
  createRichHtmlDomPurifyConfig,
  stripResidualDangerousMarkup,
} from '../../../security/richHtmlPolicy.js';

let hooksRegistered = false;

function registerDomPurifyHooks() {
  if (hooksRegistered || typeof window === 'undefined') return;
  hooksRegistered = true;

  DOMPurify.addHook('uponSanitizeAttribute', (node, data) => {
    if (data.attrName === 'href' || data.attrName === 'src' || data.attrName === 'xlink:href') {
      const value = String(data.attrValue || '');
      if (BLOCKED_URI_PATTERN.test(value)) {
        data.keepAttr = false;
        return;
      }
      if (data.attrName === 'src' && node.tagName === 'IMG') {
        const check = validateImageUrl(value, { allowEmpty: true });
        if (!check.ok || !check.url) {
          data.keepAttr = false;
        } else {
          data.attrValue = check.url;
        }
      }
    }
    if (data.attrName === 'style') {
      const value = String(data.attrValue || '');
      if (/url\s*\(\s*javascript:/i.test(value) || /expression\s*\(/i.test(value)) {
        data.keepAttr = false;
      }
    }
    if (String(data.attrName || '').toLowerCase().startsWith('on')) {
      data.keepAttr = false;
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
  const purified = DOMPurify.sanitize(String(html ?? ''), createRichHtmlDomPurifyConfig());
  return stripResidualDangerousMarkup(purified);
}
