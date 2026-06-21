import DOMPurify from 'dompurify';
import { createPlainTextDomPurifyConfig, stripResidualDangerousMarkup } from './richHtmlPolicy.js';

/**
 * Strip all HTML for plain-text display (Q&A threads, inbox previews).
 * @param {string} raw
 * @returns {string}
 */
export function sanitizePlainText(raw) {
  const purified = DOMPurify.sanitize(String(raw ?? ''), createPlainTextDomPurifyConfig());
  return stripResidualDangerousMarkup(purified).replace(/\s+/g, ' ').trim();
}
