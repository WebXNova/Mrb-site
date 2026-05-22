/**
 * Format a value into a MySQL DATETIME string.
 *
 * Input:
 * - ISO string (e.g. "2026-05-12T18:12:00.000Z")
 * - Date instance
 * - number (ms since epoch)
 * - null/undefined/empty string => returns null
 *
 * Output:
 * - "YYYY-MM-DD HH:mm:ss" (UTC-based) or null
 *
 * Returns null when the value cannot be parsed.
 */
export function formatMySqlDateTime(value, { fieldName = 'datetime' } = {}) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    value = trimmed;
  }

  let date;

  if (value instanceof Date) {
    date = value;
  } else if (typeof value === 'string' || typeof value === 'number') {
    // Accept ISO strings, timestamps, or already formatted strings that Date can parse.
    date = new Date(value);
  } else {
    return null;
  }

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  // Use UTC-based components so that ISO "Z" timestamps store
  // the same instant in the database without local timezone skew.
  const pad2 = (n) => String(n).padStart(2, '0');

  const year = date.getUTCFullYear();
  const month = pad2(date.getUTCMonth() + 1);
  const day = pad2(date.getUTCDate());
  const hours = pad2(date.getUTCHours());
  const minutes = pad2(date.getUTCMinutes());
  const seconds = pad2(date.getUTCSeconds());

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

