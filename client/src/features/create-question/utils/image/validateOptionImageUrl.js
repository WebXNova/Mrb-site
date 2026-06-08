import { validateImageUrl } from './validateImageUrl.js';

/**
 * Option image URL validation — stricter than generic question images where needed.
 * Only validated URLs may enter option state. Backend re-validates on save.
 */

const SVG_PATH_PATTERN = /\.svg($|[?#])/i;

/**
 * Optional host allowlist for external http(s) option images.
 * null = any http(s) host allowed (default).
 * @type {string[] | null}
 */
export const OPTION_IMAGE_ALLOWED_HOSTS = null;

/**
 * @param {string} url
 * @param {string[] | null} allowedHosts
 * @returns {{ ok: true } | { ok: false, message: string, code: string }}
 */
function checkAllowedHosts(url, allowedHosts) {
  if (!allowedHosts?.length) {
    return { ok: true };
  }

  if (url.startsWith('/')) {
    return { ok: true };
  }

  try {
    const { hostname } = new URL(url);
    const normalized = hostname.toLowerCase();
    const allowed = allowedHosts.some((host) => {
      const h = host.toLowerCase();
      return normalized === h || normalized.endsWith(`.${h}`);
    });
    if (!allowed) {
      return {
        ok: false,
        message: 'Image host is not on the allowed list.',
        code: 'OPTION_IMAGE_HOST_BLOCKED',
      };
    }
    return { ok: true };
  } catch {
    return { ok: false, message: 'Enter a valid image URL.', code: 'OPTION_IMAGE_MALFORMED' };
  }
}

/**
 * @param {string} raw
 * @param {{ allowEmpty?: boolean, allowedHosts?: string[] | null }} [options]
 * @returns {{ ok: true, url: string } | { ok: false, message: string, code: string }}
 */
export function validateOptionImageUrl(raw, { allowEmpty = false, allowedHosts = OPTION_IMAGE_ALLOWED_HOSTS } = {}) {
  const base = validateImageUrl(raw, { allowEmpty });
  if (!base.ok) {
    return base;
  }

  if (!base.url) {
    return base;
  }

  if (SVG_PATH_PATTERN.test(base.url)) {
    return {
      ok: false,
      message: 'SVG images are not allowed for options.',
      code: 'OPTION_IMAGE_SVG_REJECTED',
    };
  }

  const hostCheck = checkAllowedHosts(base.url, allowedHosts);
  if (!hostCheck.ok) {
    return hostCheck;
  }

  return base;
}
