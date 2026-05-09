import { clearAdminAuth, clearStudentAuth, getAdminToken, getStudentToken, setAdminAuth, setStudentAuth } from '../auth/session';
import { setAuthAuthenticated, setAuthDegraded, setAuthGuest } from '../auth/authStateMachine';
import { getRefreshInFlightPromise, runSingleFlightRefresh } from '../auth/refreshManager';
import { logAuthEvent } from '../observability/authTelemetry';
import { createHttpError, inferApiFailureMessage } from './apiErrors';
import { getApiBaseUrl, getRequestTimeoutMs } from './runtimeConfig';

const REFRESH_PATH = '/auth/refresh';
const TRANSIENT_REFRESH_STATUS = new Set([500, 502, 503, 504]);
const MAX_TRANSIENT_REFRESH_RETRIES = 1;
const CSRF_COOKIE_NAME = 'csrf_token';
const CSRF_HEADER_NAME = 'x-csrf-token';

function stripQuery(path) {
  return String(path || '').split('?')[0];
}

export class AuthRefreshError extends Error {
  constructor(message, { status = null, isNetworkError = false, isTimeout = false } = {}) {
    super(message);
    this.name = 'AuthRefreshError';
    this.status = status;
    this.isNetworkError = Boolean(isNetworkError);
    this.isTimeout = Boolean(isTimeout);
  }
}

export function isRefreshAuthRevokedError(err) {
  return err instanceof AuthRefreshError && (err.status === 401 || err.status === 403);
}

function getTokenByScope(scope) {
  if (scope === 'admin') return getAdminToken();
  if (scope === 'student') return getStudentToken();
  return null;
}

function setAuthByScope(scope, token, user) {
  if (scope === 'admin') setAdminAuth(token, user);
  if (scope === 'student') setStudentAuth(token, user);
}

function clearAuthByScope(scope) {
  if (scope === 'admin') clearAdminAuth();
  if (scope === 'student') clearStudentAuth();
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function classifyRefreshFailure(error) {
  if (isRefreshAuthRevokedError(error)) return 'revoked';
  if (error instanceof AuthRefreshError && (error.isNetworkError || error.isTimeout)) return 'transient';
  if (error instanceof AuthRefreshError && TRANSIENT_REFRESH_STATUS.has(error.status)) return 'transient';
  return 'other';
}

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

function shouldAttachCsrf(path) {
  return path === REFRESH_PATH || path === '/auth/logout' || path === '/auth/student/logout' || path === '/auth/logout-all';
}

function shouldRetryRefresh(error, retryCount) {
  if (retryCount >= MAX_TRANSIENT_REFRESH_RETRIES) return false;
  return classifyRefreshFailure(error) === 'transient';
}

async function postRefresh(scope, timeoutMs) {
  const requestUrl = `${getApiBaseUrl()}${REFRESH_PATH}`;
  const csrfToken = readCookie(CSRF_COOKIE_NAME);
  let response;
  try {
    response = await fetchWithTimeout(
      requestUrl,
      {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'x-auth-role': scope,
          ...(csrfToken ? { [CSRF_HEADER_NAME]: csrfToken } : {}),
        },
      },
      timeoutMs
    );
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new AuthRefreshError('Refresh timeout', { isTimeout: true });
    }
    if (error instanceof TypeError) {
      throw new AuthRefreshError('Refresh network error', { isNetworkError: true });
    }
    throw error;
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new AuthRefreshError(payload.message || 'Session refresh failed', { status: response.status });
  }
  return { user: payload?.data?.user || payload?.data?.admin || payload?.data?.student || null };
}

export function refreshAccessToken(scope, { timeoutMs = getRequestTimeoutMs(), _allowFollowup = true } = {}) {
  if (!scope || (scope !== 'admin' && scope !== 'student')) {
    return Promise.reject(new Error('Invalid auth scope for refresh'));
  }

  const inFlight = getRefreshInFlightPromise();
  if (inFlight) {
    return inFlight.catch(() => null).then(() => {
      const existingToken = getTokenByScope(scope);
      if (existingToken) return existingToken;
      if (_allowFollowup) {
        return refreshAccessToken(scope, { timeoutMs, _allowFollowup: false });
      }
      throw new AuthRefreshError('Session refresh failed', { status: 401 });
    });
  }

  return runSingleFlightRefresh(async () => {
    logAuthEvent('refresh.start', { scope });
    let retryCount = 0;
    for (;;) {
      try {
        const out = await postRefresh(scope, timeoutMs);
        setAuthByScope(scope, '__cookie_session__', out.user);
        setAuthAuthenticated();
        logAuthEvent('refresh.success', { scope, retries: retryCount });
        return '__cookie_session__';
      } catch (error) {
        const cls = classifyRefreshFailure(error);
        logAuthEvent('refresh.failure', {
          scope,
          classification: cls,
          status: error?.status || null,
          retryCount,
        });
        if (shouldRetryRefresh(error, retryCount)) {
          retryCount += 1;
          logAuthEvent('refresh.retry', { scope, retryCount });
          continue;
        }
        if (cls === 'revoked') {
          clearAuthByScope(scope);
          setAuthGuest('refresh-revoked');
        } else if (cls === 'transient') {
          setAuthDegraded('refresh-transient-failure');
        }
        throw error;
      }
    }
  }).then(() => {
    const token = getTokenByScope(scope);
    if (token) return token;
    throw new AuthRefreshError('Session refresh failed', { status: 401 });
  });
}

async function waitForRefresh() {
  const inFlight = getRefreshInFlightPromise();
  if (!inFlight) return;
  await inFlight.catch(() => {});
}

function buildBodyAndHeaders(body, headers = {}) {
  if (body === undefined || body === null) {
    return { body: undefined, headers };
  }
  if (body instanceof FormData) {
    return { body, headers };
  }
  return {
    body: JSON.stringify(body),
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  };
}

export async function request(path, options = {}) {
  const {
    method = 'GET',
    body,
    headers = {},
    token,
    authScope = null,
    retryOnUnauthorized = true,
    timeoutMs = getRequestTimeoutMs(),
    skipRefreshQueue = false,
  } = options;

  if (!skipRefreshQueue && authScope) {
    await waitForRefresh();
  }

  void token;
  void getTokenByScope(authScope);
  const prepared = buildBodyAndHeaders(body, headers);
  const csrfToken = shouldAttachCsrf(path) ? readCookie(CSRF_COOKIE_NAME) : '';
  const requestUrl = `${getApiBaseUrl()}${path}`;

  let response;
  try {
    response = await fetchWithTimeout(
      requestUrl,
      {
        method,
        credentials: 'include',
        headers: {
          ...(csrfToken ? { [CSRF_HEADER_NAME]: csrfToken } : {}),
          ...prepared.headers,
        },
        body: prepared.body,
      },
      timeoutMs
    );
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw createHttpError('Request timeout', { status: 408 });
    }
    if (error instanceof TypeError) {
      throw createHttpError('Cannot connect to API server. Check API_BASE and backend availability.', { status: 503 });
    }
    throw error;
  }

  const rawBody = await response.text();
  let data = {};
  try {
    data = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    data = {};
  }
  if (response.ok) return data;

  if (response.status === 401) {
    logAuthEvent('request.401', { path: stripQuery(path), authScope: authScope || 'none' });
  }

  const failMsg = () =>
    inferApiFailureMessage(data, { status: response.status, statusText: response.statusText, rawText: rawBody });

  if (response.status === 401 && retryOnUnauthorized && authScope && path !== REFRESH_PATH) {
    try {
      const nextToken = await refreshAccessToken(authScope, { timeoutMs });
      return request(path, {
        ...options,
        token: nextToken,
        retryOnUnauthorized: false,
        skipRefreshQueue: true,
      });
    } catch (error) {
      if (isRefreshAuthRevokedError(error)) {
        throw createHttpError('Session expired', { status: 401, refreshAlreadyTried: true });
      }
      if (error instanceof AuthRefreshError && (error.isNetworkError || error.isTimeout || TRANSIENT_REFRESH_STATUS.has(error.status))) {
        throw createHttpError('Temporary auth connectivity issue. Please retry.', { status: error.status || 503, refreshAlreadyTried: true });
      }
      throw createHttpError(error?.message || 'Refresh failed', { status: error?.status || 503, refreshAlreadyTried: true });
    }
  }

  if (response.status === 401) {
    throw createHttpError(failMsg() || 'Unauthorized', { status: 401, refreshAlreadyTried: true });
  }
  throw createHttpError(failMsg(), { status: response.status });
}

