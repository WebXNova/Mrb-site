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

/**
 * Resolve a course thumbnail URL for safe display in <img src>.
 * Normalizes legacy upload paths, preserves signed query params, and applies receiptMediaUrl for cross-origin API hosts.
 */
export function resolveCourseThumbnailUrl(raw) {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return '';

  const queryIndex = trimmed.indexOf('?');
  const pathPart = queryIndex >= 0 ? trimmed.slice(0, queryIndex) : trimmed;
  const queryPart = queryIndex >= 0 ? trimmed.slice(queryIndex + 1) : '';

  let resolvedPath = pathPart;

  if (pathPart.startsWith('/uploads/courses/')) {
    resolvedPath = receiptMediaUrl(`/api${pathPart}`);
  } else if (/^uploads\/courses\//i.test(pathPart)) {
    resolvedPath = receiptMediaUrl(`/api/${pathPart.replace(/^\/+/, '')}`);
  } else if (pathPart.startsWith('/uploads/course-covers/')) {
    resolvedPath = receiptMediaUrl(`/api${pathPart}`);
  } else if (/^uploads\/course-covers\//i.test(pathPart)) {
    resolvedPath = receiptMediaUrl(`/api/${pathPart.replace(/^\/+/, '')}`);
  } else if (pathPart.startsWith('/api/uploads/')) {
    resolvedPath = receiptMediaUrl(pathPart);
  } else {
    resolvedPath = receiptMediaUrl(pathPart);
  }

  if (queryPart) {
    return `${resolvedPath}?${queryPart}`;
  }
  return resolvedPath;
}
