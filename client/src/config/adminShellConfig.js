/**
 * Runtime admin shell configuration — injected into index.html at serve/build time.
 * Not bundled in JS source; read once from window.__MRB_ADMIN_SHELL__.
 */

const SHELL_GLOBAL = '__MRB_ADMIN_SHELL__';

/**
 * @returns {string} Secret path segment (no slashes).
 */
export function getAdminShellSegment() {
  if (typeof window === 'undefined') {
    throw new Error('Admin shell configuration is only available in the browser.');
  }

  const shell = window[SHELL_GLOBAL];
  const segment = shell?.s;

  if (!segment || typeof segment !== 'string') {
    throw new Error(
      'Admin shell configuration is missing. Ensure ADMIN_SECRET_PATH is set on the API server and the HTML shell is injected.'
    );
  }

  return segment;
}

export function isAdminShellConfigured() {
  if (typeof window === 'undefined') return false;
  const segment = window[SHELL_GLOBAL]?.s;
  return typeof segment === 'string' && segment.length > 0;
}

/**
 * Whether a browser pathname is the legacy predictable `/admin` surface.
 * @param {string} pathname
 */
export function isLegacyAdminUiPath(pathname) {
  const normalized = String(pathname || '').split('?')[0];
  return normalized === '/admin' || normalized.startsWith('/admin/');
}
