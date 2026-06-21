/**
 * Strip HTML tags for short list previews (client-side only).
 * @param {string} html
 * @param {number} [maxLen]
 */
export function previewQuestionText(html, maxLen = 140) {
  const text = String(html ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return '—';
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen - 1)}…`;
}

/**
 * @param {string} value
 */
export function difficultyLabel(value) {
  if (!value) return '—';
  const normalized = String(value).toLowerCase();
  if (normalized === 'easy') return 'Easy';
  if (normalized === 'medium') return 'Medium';
  if (normalized === 'hard') return 'Hard';
  return value;
}

/**
 * @param {BlobPart} content
 * @param {string} fileName
 */
export function downloadTextFile(content, fileName) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
