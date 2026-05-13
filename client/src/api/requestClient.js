import { clearAdminAuth, clearStudentAuth, getAdminToken, getStudentToken, setAdminAuth, setStudentAuth } from '../auth/session';
import { setAuthAuthenticated, setAuthDegraded, setAuthGuest } from '../auth/authStateMachine';
import {
  RefreshFailureKind,
  classifyRefreshHttpFailure,
  isConfirmedAuthTerminationKind,
  isTransientRefreshKind,
} from '../auth/refreshFailureKind';
import { getRefreshInFlightPromise, runSingleFlightRefresh } from '../auth/refreshManager';
import { logAuthEvent } from '../observability/authTelemetry';
import { createHttpError, inferApiFailureMessage } from './apiErrors';
import { getApiBaseUrl, getRequestTimeoutMs } from './runtimeConfig';

const REFRESH_PATH = '/auth/refresh';
const MAX_TRANSIENT_REFRESH_RETRIES = 2;
const CSRF_RETRY_DELAY_MS = 80;
const CSRF_COOKIE_NAME = 'csrf_token';
const CSRF_HEADER_NAME = 'x-csrf-token';

function stripQuery(path) {
  return String(path || '').split('?')[0];
}

export class AuthRefreshError extends Error {
  constructor(message, { status = null, kind = RefreshFailureKind.UNKNOWN, isNetworkError = false, isTimeout = false } = {}) {
    super(message);
    this.name = 'AuthRefreshError';
    this.status = status;
    this.kind = kind;
    this.isNetworkError = Boolean(isNetworkError);
    this.isTimeout = Boolean(isTimeout);
  }
}

/** True when refresh failure means the server rejected the session (logout local display state). */
export function isRefreshAuthRevokedError(err) {
  return err instanceof AuthRefreshError && isConfirmedAuthTerminationKind(err.kind);
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

function degradedReasonForRefreshKind(kind) {
  if (kind === RefreshFailureKind.CSRF_MISMATCH) return 'refresh-csrf';
  if (kind === RefreshFailureKind.ORIGIN_POLICY) return 'refresh-origin';
  if (kind === RefreshFailureKind.FORBIDDEN_POLICY) return 'refresh-policy';
  if (kind === RefreshFailureKind.MALFORMED_RESPONSE) return 'refresh-malformed';
  return 'refresh-degraded';
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
  if (!(error instanceof AuthRefreshError)) return 'unknown';
  if (isConfirmedAuthTerminationKind(error.kind)) return 'revoked';
  if (isTransientRefreshKind(error.kind)) return 'transient';
  return 'recoverable';
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

function shouldRetryTransientRefresh(error, retryCount) {
  if (retryCount >= MAX_TRANSIENT_REFRESH_RETRIES) return false;
  return error instanceof AuthRefreshError && isTransientRefreshKind(error.kind);
}

async function postRefresh(scope, timeoutMs) {
  const requestUrl = `${getApiBaseUrl()}${REFRESH_PATH}`;

  for (let csrfAttempt = 0; csrfAttempt < 2; csrfAttempt += 1) {
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
        throw new AuthRefreshError('Refresh timeout', { kind: RefreshFailureKind.TIMEOUT, isTimeout: true });
      }
      if (error instanceof TypeError) {
        throw new AuthRefreshError('Refresh network error', { kind: RefreshFailureKind.NETWORK_FAILURE, isNetworkError: true });
      }
      throw error;
    }

    const rawBody = await response.text();
    let data = {};
    try {
      data = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      if (response.ok) {
        throw new AuthRefreshError('Malformed refresh response', {
          status: response.status,
          kind: RefreshFailureKind.MALFORMED_RESPONSE,
        });
      }
      data = {};
    }

    if (response.ok) {
      const user = data?.data?.user || data?.data?.admin || data?.data?.student || null;
      if (!user || typeof user !== 'object' || user.id == null) {
        throw new AuthRefreshError('Malformed refresh response', {
          status: response.status,
          kind: RefreshFailureKind.MALFORMED_RESPONSE,
        });
      }
      return { user };
    }

    const message = inferApiFailureMessage(data, {
      status: response.status,
      statusText: response.statusText,
      rawText: rawBody,
    });
    const kind = classifyRefreshHttpFailure(response.status, message);

    if (kind === RefreshFailureKind.CSRF_MISMATCH && csrfAttempt === 0) {
      logAuthEvent('refresh.csrf_retry', { scope });
      await new Promise((r) => setTimeout(r, CSRF_RETRY_DELAY_MS));
      continue;
    }

    throw new AuthRefreshError(message || 'Session refresh failed', { status: response.status, kind });
  }

  throw new AuthRefreshError('Session refresh failed', { status: 403, kind: RefreshFailureKind.CSRF_MISMATCH });
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
      throw new AuthRefreshError('Session refresh failed', { status: 401, kind: RefreshFailureKind.REVOKED_SESSION });
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
        const kind = error instanceof AuthRefreshError ? error.kind : RefreshFailureKind.UNKNOWN;
        logAuthEvent('refresh.failure', {
          scope,
          classification: cls,
          kind,
          status: error?.status ?? null,
          retryCount,
        });
        if (shouldRetryTransientRefresh(error, retryCount)) {
          retryCount += 1;
          logAuthEvent('refresh.retry', { scope, retryCount, kind });
          continue;
        }
        if (isConfirmedAuthTerminationKind(kind)) {
          clearAuthByScope(scope);
          setAuthGuest('refresh-revoked');
        } else if (cls === 'transient') {
          setAuthDegraded('refresh-transient-failure');
        } else if (cls === 'recoverable') {
          setAuthDegraded(degradedReasonForRefreshKind(kind));
        }
        throw error;
      }
    }
  }).then(() => {
    const token = getTokenByScope(scope);
    if (token) return token;
    throw new AuthRefreshError('Session refresh failed', { status: 401, kind: RefreshFailureKind.REVOKED_SESSION });
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

function refreshFailureUserMessage(kind) {
  if (kind === RefreshFailureKind.CSRF_MISMATCH) {
    return 'Security validation failed while refreshing your session. Try reloading the page.';
  }
  if (kind === RefreshFailureKind.ORIGIN_POLICY) {
    return 'This app origin is not authorized to refresh the session. Check deployment configuration.';
  }
  return null;
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
      if (error instanceof AuthRefreshError && isConfirmedAuthTerminationKind(error.kind)) {
        throw createHttpError('Session expired', {
          status: 401,
          refreshAlreadyTried: true,
          refreshFailureKind: error.kind,
        });
      }
      if (error instanceof AuthRefreshError && isTransientRefreshKind(error.kind)) {
        throw createHttpError('Temporary auth connectivity issue. Please retry.', {
          status: error.status && error.status >= 500 ? error.status : 503,
          refreshAlreadyTried: true,
          refreshFailureKind: error.kind,
        });
      }
      if (error instanceof AuthRefreshError) {
        const hint = refreshFailureUserMessage(error.kind);
        throw createHttpError(hint || error.message || 'Refresh failed', {
          status: error.status && error.status >= 400 ? error.status : 503,
          refreshAlreadyTried: true,
          refreshFailureKind: error.kind,
        });
      }
      throw createHttpError(error?.message || 'Refresh failed', { status: 503, refreshAlreadyTried: true });
    }
  }

  if (response.status === 401) {
    throw createHttpError(failMsg() || 'Unauthorized', { status: 401, refreshAlreadyTried: true });
  }
  throw createHttpError(failMsg(), { status: response.status });
}
