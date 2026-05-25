/** Trim display input only; backend validates URL semantics. */
export function normalizeYoutubeUrlInput(raw) {
  return String(raw ?? '').trim();
}

/**
 * Light shape check aligned with backend YouTube pattern (UX-only).
 * @param {string} url
 */
export function isLikelyYoutubeWatchUrl(url) {
  if (!url) return false;
  const trimmed = normalizeYoutubeUrlInput(url);
  const pattern =
    /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=[\w-]{11}(&.*)?|youtu\.be\/[\w-]{11}(\?.*)?)$/i;
  return pattern.test(trimmed);
}

/** @param {unknown} raw */
export function parseNonNegativeSortOrder(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) return null;
  return n;
}

/**
 * Normalize title whitespace (collapse internal spaces).
 * @param {string} raw
 */
export function normalizeLectureTitle(raw) {
  return String(raw ?? '')
    .trim()
    .replace(/\s+/g, ' ');
}
