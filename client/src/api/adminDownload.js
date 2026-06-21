import { inferApiFailureMessage } from './apiErrors';
import { refreshAccessToken } from './requestClient';
import { getApiBaseUrl } from './runtimeConfig';
import { adminApiPath } from '../config/adminPaths';

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
 * Cookie + CSRF authenticated download for admin binary endpoints (CSV, XLSX).
 * Retries once after admin refresh on 401.
 */
export async function adminAuthenticatedDownload(
  relativePath,
  {
    method = 'GET',
    body = null,
    accept = '*/*',
    authScope = 'admin',
  } = {}
) {
  const ap = adminApiPath;
  const url = `${getApiBaseUrl()}${ap(relativePath)}`;

  async function doFetch() {
    const csrfToken = readCookie(CSRF_COOKIE_NAME);
    const headers = {
      Accept: accept,
      ...(csrfToken ? { [CSRF_HEADER_NAME]: csrfToken } : {}),
      ...(body != null ? { 'Content-Type': 'application/json' } : {}),
    };
    return fetch(url, {
      method,
      credentials: 'include',
      headers,
      body: body != null ? JSON.stringify(body) : undefined,
    });
  }

  let response = await doFetch();
  if (response.status === 401 && authScope) {
    await refreshAccessToken(authScope);
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
