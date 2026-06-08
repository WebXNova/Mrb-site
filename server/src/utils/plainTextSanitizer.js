import sanitizeHtml from 'sanitize-html';

/**
 * Strip all HTML and normalize whitespace for plain-text storage fields.
 * @param {unknown} value
 * @param {{ maxLength?: number }} [options]
 */
export function sanitizePlainText(value, { maxLength } = {}) {
  const stripped = sanitizeHtml(String(value ?? ''), {
    allowedTags: [],
    allowedAttributes: {},
  })
    .replace(/\s+/g, ' ')
    .trim();

  if (maxLength != null && stripped.length > maxLength) {
    return stripped.slice(0, maxLength);
  }
  return stripped;
}
