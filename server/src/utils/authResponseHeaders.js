/**
 * Prevent auth responses (tokens, user payloads) from being cached by browsers or intermediaries.
 */
export function applyAuthResponseSecurityHeaders(res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, max-age=0, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Referrer-Policy', 'no-referrer');
}
