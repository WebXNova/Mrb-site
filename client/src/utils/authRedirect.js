/** Only allow internal path redirects (avoid open redirects). */
export function safeRedirectPath(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.includes('://')) return null;
  return trimmed;
}

/** Preserve a safe `from` query on login/register links. */
export function withSafeFromQuery(path, fromRaw) {
  const from = safeRedirectPath(fromRaw);
  if (!from) return path;
  return `${path}?from=${encodeURIComponent(from)}`;
}
