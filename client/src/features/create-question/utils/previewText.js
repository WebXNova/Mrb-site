/**
 * Preview utilities — plain text only.
 * Preview rendering must never execute raw HTML.
 */

/**
 * Strip angle-bracket sequences for safe preview display.
 * Phase 1 placeholder until centralized sanitization is wired.
 *
 * @param {string} raw
 * @returns {string}
 */
export function toSafePreviewText(raw) {
  return String(raw ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * @param {string} text
 * @param {number} [maxLength=200]
 * @returns {string}
 */
export function truncatePreviewText(text, maxLength = 200) {
  const safe = toSafePreviewText(text);
  if (safe.length <= maxLength) return safe;
  return `${safe.slice(0, maxLength).trim()}…`;
}
