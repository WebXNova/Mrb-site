import { inferApiFailureMessage } from './apiErrors';
import { refreshAccessToken } from './requestClient';
import { getApiBaseUrl } from './runtimeConfig';

const CSRF_COOKIE_NAME = 'csrf_token';
const CSRF_HEADER_NAME = 'x-csrf-token';

function readCookie(name) {
  if (typeof document === 'undefined') return '';
  const prefix = `${encodeURIComponent(name)}=`;
  const parts = document.cookie ? document.cookie.split('; ') : [];
  for (const part of parts) {
    if (part.startsWith(prefix)) {
      return decodeURIComponent(part.slice(prefix.length));
    }
  }
  return '';
}

/**
 * Cookie + CSRF authenticated download for student note files.
 */
export async function studentAuthenticatedDownload(relativePath, { method = 'GET' } = {}) {
  const url = `${getApiBaseUrl()}${relativePath}`;

  async function doFetch() {
    const csrfToken = readCookie(CSRF_COOKIE_NAME);
    const headers = {
      Accept: '*/*',
      ...(csrfToken ? { [CSRF_HEADER_NAME]: csrfToken } : {}),
    };
    return fetch(url, {
      method,
      credentials: 'include',
      headers,
    });
  }

  let response = await doFetch();
  if (response.status === 401) {
    await refreshAccessToken('student');
    response = await doFetch();
  }

  if (!response.ok) {
    const rawText = await response.text();
    let data = {};
    try {
      data = rawText ? JSON.parse(rawText) : {};
    } catch {
      data = {};
    }
    throw new Error(
      inferApiFailureMessage(data, {
        status: response.status,
        statusText: response.statusText,
        rawText,
      }) || 'Download failed'
    );
  }

  const blob = await response.blob();
  const header = response.headers.get('content-disposition') || '';
  const match = header.match(/filename="([^"]+)"/i);
  return { blob, filename: match?.[1] || null };
}
