import { clearAdminAuth, getAdminToken } from '../auth/session';
import { AuthRefreshError, isRefreshAuthRevokedError, refreshAdminAccessToken } from './authRefresh.js';
import { createHttpError } from './apiErrors.js';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';
const REFRESH_PATH = '/auth/refresh';

function redirectAdminToLogin() {
  if (typeof window === 'undefined') return;
  const p = window.location.pathname;
  if (p.startsWith('/admin/login')) return;
  if (p.startsWith('/admin')) {
    window.location.href = '/admin/login';
  }
}

async function request(path, { method = 'GET', body, token, headers = {}, retryOnUnauthorized = true } = {}) {
  const requestUrl = `${API_BASE}${path}`;
  const authToken = token ?? getAdminToken();
  try {
    const response = await fetch(requestUrl, {
      method,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401 && retryOnUnauthorized && path !== REFRESH_PATH) {
        try {
          const refreshedToken = await refreshAdminAccessToken();
          return request(path, {
            method,
            body,
            headers,
            token: refreshedToken,
            retryOnUnauthorized: false,
          });
        } catch (e) {
          if (e instanceof AuthRefreshError && e.isNetworkError) {
            throw new Error(
              'Cannot connect to API server. Please ensure backend is running on http://localhost:4000.',
            );
          }
          if (isRefreshAuthRevokedError(e)) {
            clearAdminAuth();
            redirectAdminToLogin();
            throw createHttpError('Session expired', { status: 401, refreshAlreadyTried: true });
          }
          throw createHttpError(e.message || 'Refresh failed', { status: e.status ?? 503 });
        }
      }
      if (response.status === 401) {
        throw createHttpError(data.message || 'Unauthorized', { status: 401, refreshAlreadyTried: true });
      }
      throw createHttpError(data.message || 'Request failed', { status: response.status });
    }
    return data;
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error('Cannot connect to API server. Please check backend availability or set VITE_API_BASE_URL correctly.');
    }
    throw error;
  }
}

export const http = {
  get: (path, options) => request(path, { ...options, method: 'GET' }),
  post: (path, body, options) => request(path, { ...options, method: 'POST', body }),
  put: (path, body, options) => request(path, { ...options, method: 'PUT', body }),
  patch: (path, body, options) => request(path, { ...options, method: 'PATCH', body }),
  delete: (path, options) => request(path, { ...options, method: 'DELETE' }),
};
