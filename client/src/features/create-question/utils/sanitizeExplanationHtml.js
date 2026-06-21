import DOMPurify from 'dompurify';
import {
  BLOCKED_URI_PATTERN,
  createRichHtmlDomPurifyConfig,
  stripResidualDangerousMarkup,
} from '../../../security/richHtmlPolicy.js';

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

/**
 * Sanitize explanation HTML before storage or API submission.
 * Never returns raw editor output.
 *
 * @param {string} html — untrusted CKEditor output
 * @returns {string} safeHtml — sanitized HTML safe for draft state and submit payload
 */
export function sanitizeExplanationHtml(html) {
  const purified = DOMPurify.sanitize(String(html ?? ''), createRichHtmlDomPurifyConfig());
  return stripResidualDangerousMarkup(purified);
}
