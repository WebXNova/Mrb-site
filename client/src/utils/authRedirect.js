/** Only allow internal path redirects (avoid open redirects). */
export function safeRedirectPath(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.includes('://')) return null;
  return trimmed;
}
