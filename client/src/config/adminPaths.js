import { getAdminShellSegment } from './adminShellConfig.js';

/**
 * SPA route under the secret admin base, e.g. `/<segment>/courses`.
 * @param {string} [subpath]
 */
export function adminRoute(subpath = '') {
  const base = `/${getAdminShellSegment()}`;
  if (!subpath) return base;
  const clean = String(subpath).replace(/^\/+/, '');
  return clean ? `${base}/${clean}` : base;
}

/**
 * API path relative to `/api`, e.g. `/admin/<segment>/dashboard`.
 * @param {string} subpath
 */
export function adminApiPath(subpath) {
  const segment = getAdminShellSegment();
  const clean = String(subpath || '').replace(/^\/+/, '');
  return clean ? `/admin/${segment}/${clean}` : `/admin/${segment}`;
}

/**
 * Strip query string from an API path.
 * @param {string} path
 */
function stripQuery(path) {
  return String(path || '').split('?')[0];
}

/**
 * Whether a relative API path (under `/api`) requires admin CSRF attachment.
 * @param {string} path
 */
export function isAdminApiMutationPrefix(path) {
  const segment = getAdminShellSegment();
  const p = stripQuery(path);
  const prefix = `/admin/${segment}`;
  return p === prefix || p.startsWith(`${prefix}/`);
}
