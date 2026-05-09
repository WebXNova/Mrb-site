/**
 * Build absolute URL for API-hosted media (uploads) when VITE_API_BASE_URL is absolute.
 * Same-origin `/api` paths stay relative so Vite proxy keeps working in dev.
 */
export function receiptMediaUrl(pathOrUrl) {
  if (!pathOrUrl) return '';
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;

  const apiBase = String(import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
  if (/^https?:\/\//i.test(apiBase)) {
    const originOnly = apiBase.replace(/\/api$/i, '');
    return `${originOnly}${pathOrUrl}`;
  }

  return pathOrUrl;
}
