/**
 * Strip HTML and normalize plain text for storage/display.
 * @param {string} value
 * @param {number} maxLength
 * @returns {string}
 */
export function sanitizePlainText(value, maxLength = 5000) {
  if (value == null) return '';
  let text = String(value)
    .replace(/<[^>]*>/g, '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (maxLength > 0 && text.length > maxLength) {
    text = text.slice(0, maxLength);
  }
  return text;
}
