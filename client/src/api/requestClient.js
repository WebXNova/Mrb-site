import { clearAdminAuth, clearStudentAuth, clearTeacherAuth, getAdminToken, getStudentToken, getTeacherToken, setAdminAuth, setStudentAuth, setTeacherAuth, syncGlobalAuthState } from '../auth/session';
import { setAuthAuthenticated, setAuthDegraded } from '../auth/authStateMachine';
import {
  RefreshFailureKind,
  classifyRefreshHttpFailure,
  isConfirmedAuthTerminationKind,
  isTransientRefreshKind,
} from '../auth/refreshFailureKind';
import {
  acquireCrossTabRefreshLease,
  broadcastRefreshComplete,
  broadcastRefreshFailed,
  releaseCrossTabRefreshLease,
} from '../auth/crossTabRefreshCoordinator';
import { getRefreshInFlightPromise, runSingleFlightRefresh } from '../auth/refreshManager';
import { logAuthEvent } from '../observability/authTelemetry';
import { createHttpError, inferApiFailureMessage } from './apiErrors';
import { REFRESH_PATH, shouldAttachCsrf } from './csrfAttachPolicy.js';
import { getApiBaseUrl, getRequestTimeoutMs } from './runtimeConfig';
import { isAuthDebugEnabled } from './runtimeConfig';

const MAX_TRANSIENT_REFRESH_RETRIES = 2;
const MAX_SUPERSEDED_REFRESH_RETRIES = 3;
const SUPERSEDED_RETRY_DELAY_MS = 120;
const CSRF_RETRY_DELAY_MS = 80;
const CSRF_COOKIE_NAME = 'csrf_token';
const CSRF_HEADER_NAME = 'x-csrf-token';

function profileRequest(label, meta = {}) {
  if (!isAuthDebugEnabled()) return { end() {} };
  const t0 = performance.now();
  // eslint-disable-next-line no-console
  console.time(`[auth-request] ${label}`);
  return {
    end(outcome, extra = {}) {
      const ms = Number((performance.now() - t0).toFixed(2));
      // eslint-disable-next-line no-console
      console.timeEnd(`[auth-request] ${label}`);
      logAuthEvent('request.timing', { label, outcome, durationMs: ms, ...meta, ...extra });
    },
  };
}

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
  if (scope === 'teacher') return getTeacherToken();
  return null;
}

function setAuthByScope(scope, token, user) {
  if (scope === 'admin') setAdminAuth(token, user);
  if (scope === 'student') setStudentAuth(token, user);
  if (scope === 'teacher') setTeacherAuth(token, user);
}

function clearAuthByScope(scope) {
  if (scope === 'admin') clearAdminAuth();
  if (scope === 'student') clearStudentAuth();
  if (scope === 'teacher') clearTeacherAuth();
}

function degradedReasonForRefreshKind(kind) {
  if (kind === RefreshFailureKind.CSRF_MISMATCH) return 'refresh-csrf';
  if (kind === RefreshFailureKind.ORIGIN_POLICY) return 'refresh-origin';
  if (kind === RefreshFailureKind.FORBIDDEN_POLICY) return 'refresh-policy';
  if (kind === RefreshFailureKind.MALFORMED_RESPONSE) return 'refresh-malformed';
  return 'refresh-degraded';
}

async function fetchWithTimeout(url, options, timeoutMs, externalSignal) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  
  // Combine external signal with timeout signal
  if (externalSignal) {
    externalSignal.addEventListener('abort', () => controller.abort());
  }
  
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function classifyRefreshFailure(error) {
  if (!(error instanceof AuthRefreshError)) return 'unknown';
  if (isConfirmedAuthTerminationKind(error.kind)) return 'revoked';
  if (error.kind === RefreshFailureKind.REFRESH_SUPERSEDED) return 'recoverable';
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

function shouldRetryTransientRefresh(error, retryCount) {
  if (retryCount >= MAX_TRANSIENT_REFRESH_RETRIES) return false;
  return error instanceof AuthRefreshError && isTransientRefreshKind(error.kind);
}

async function postRefresh(scope, timeoutMs) {
  const requestUrl = `${getApiBaseUrl()}${REFRESH_PATH}`;
  const profile = profileRequest(`POST ${REFRESH_PATH}`, { scope });

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
      const user = data?.data?.user || data?.data?.admin || data?.data?.student || data?.data?.teacher || null;
      if (!user || typeof user !== 'object' || user.id == null) {
        profile.end('malformed');
        throw new AuthRefreshError('Malformed refresh response', {
          status: response.status,
          kind: RefreshFailureKind.MALFORMED_RESPONSE,
        });
      }
      profile.end('ok', { status: response.status, csrfAttempt });
      return { user };
    }

    const message = inferApiFailureMessage(data, {
      status: response.status,
      statusText: response.statusText,
      rawText: rawBody,
    });
    const errorCode = data?.error?.code ?? data?.errorCode ?? null;
    const kind = classifyRefreshHttpFailure(response.status, message, errorCode);

    if (kind === RefreshFailureKind.CSRF_MISMATCH && csrfAttempt === 0) {
      logAuthEvent('refresh.csrf_retry', { scope });
      await new Promise((r) => setTimeout(r, CSRF_RETRY_DELAY_MS));
      continue;
    }

    throw new AuthRefreshError(message || 'Session refresh failed', { status: response.status, kind });
  }

  profile.end('csrf-failed');
  throw new AuthRefreshError('Session refresh failed', { status: 403, kind: RefreshFailureKind.CSRF_MISMATCH });
}

function shouldRetrySupersededRefresh(error, retryCount) {
  if (retryCount >= MAX_SUPERSEDED_REFRESH_RETRIES) return false;
  return error instanceof AuthRefreshError && error.kind === RefreshFailureKind.REFRESH_SUPERSEDED;
}

async function applyFollowerRefreshResult(scope, result) {
  if (result?.ok) {
    if (result.user && typeof result.user === 'object' && result.user.id != null) {
      setAuthByScope(scope, '__cookie_session__', result.user);
    }
    setAuthAuthenticated();
    const token = getTokenByScope(scope);
    if (token) return token;
    return '__cookie_session__';
  }
  if (result?.revoked) {
    clearAuthByScope(scope);
    syncGlobalAuthState('refresh-revoked');
    throw new AuthRefreshError('Session refresh failed', { status: 401, kind: RefreshFailureKind.REVOKED_SESSION });
  }
  throw new AuthRefreshError('Session refresh failed', { status: 401, kind: RefreshFailureKind.REFRESH_SUPERSEDED });
}

async function executeRefreshAttempt(scope, timeoutMs) {
  let retryCount = 0;
  let supersededRetryCount = 0;
  for (;;) {
    try {
      const out = await postRefresh(scope, timeoutMs);
      setAuthByScope(scope, '__cookie_session__', out.user);
      setAuthAuthenticated();
      logAuthEvent('refresh.success', { scope, retries: retryCount, supersededRetries: supersededRetryCount });
      return { token: '__cookie_session__', user: out.user };
    } catch (error) {
      const cls = classifyRefreshFailure(error);
      const kind = error instanceof AuthRefreshError ? error.kind : RefreshFailureKind.UNKNOWN;
      logAuthEvent('refresh.failure', {
        scope,
        classification: cls,
        kind,
        status: error?.status ?? null,
        retryCount,
        supersededRetryCount,
      });
      if (shouldRetryTransientRefresh(error, retryCount)) {
        retryCount += 1;
        logAuthEvent('refresh.retry', { scope, retryCount, kind });
        continue;
      }
      if (shouldRetrySupersededRefresh(error, supersededRetryCount)) {
        supersededRetryCount += 1;
        logAuthEvent('refresh.superseded_retry', { scope, supersededRetryCount });
        await new Promise((r) => setTimeout(r, SUPERSEDED_RETRY_DELAY_MS));
        continue;
      }
      if (isConfirmedAuthTerminationKind(kind)) {
        clearAuthByScope(scope);
        syncGlobalAuthState('refresh-revoked');
      } else if (cls === 'transient') {
        setAuthDegraded('refresh-transient-failure');
      } else if (cls === 'recoverable') {
        setAuthDegraded(degradedReasonForRefreshKind(kind));
      }
      throw error;
    }
  }
}

export function refreshAccessToken(scope, { timeoutMs = getRequestTimeoutMs() } = {}) {
  if (!scope || (scope !== 'admin' && scope !== 'student' && scope !== 'teacher')) {
    return Promise.reject(new Error('Invalid auth scope for refresh'));
  }

  const inFlight = getRefreshInFlightPromise(scope);
  if (inFlight) {
    return inFlight;
  }

  return runSingleFlightRefresh(scope, async () => {
    logAuthEvent('refresh.start', { scope });
    const lease = await acquireCrossTabRefreshLease(scope);
    if (lease.role === 'follower') {
      logAuthEvent('refresh.follower_wait', { scope });
      try {
        const result = await lease.wait;
        logAuthEvent('refresh.follower_done', { scope, ok: Boolean(result?.ok), via: result?.via || 'unknown' });
        return applyFollowerRefreshResult(scope, result);
      } catch (error) {
        const existingToken = getTokenByScope(scope);
        if (existingToken) return existingToken;
        throw error;
      }
    }

    try {
      const { token, user } = await executeRefreshAttempt(scope, timeoutMs);
      broadcastRefreshComplete(scope, { user });
      return token;
    } catch (error) {
      const kind = error instanceof AuthRefreshError ? error.kind : RefreshFailureKind.UNKNOWN;
      broadcastRefreshFailed(scope, { revoked: isConfirmedAuthTerminationKind(kind) });
      throw error;
    } finally {
      releaseCrossTabRefreshLease(scope);
    }
  }).then((token) => {
    if (token) return token;
    const existingToken = getTokenByScope(scope);
    if (existingToken) return existingToken;
    throw new AuthRefreshError('Session refresh failed', { status: 401, kind: RefreshFailureKind.REVOKED_SESSION });
  });
}

async function waitForRefresh(authScope) {
  if (!authScope) return;
  const inFlight = getRefreshInFlightPromise(authScope);
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
    idempotencyKey,
    signal,
  } = options;

  if (!skipRefreshQueue && authScope) {
    await waitForRefresh(authScope);
  }

  void token;
  void getTokenByScope(authScope);
  const prepared = buildBodyAndHeaders(body, headers);
  const csrfToken = shouldAttachCsrf(path, method) ? readCookie(CSRF_COOKIE_NAME) : '';
  const requestUrl = `${getApiBaseUrl()}${path}`;
  const profile = profileRequest(`${method} ${stripQuery(path)}`, { authScope: authScope || 'none' });

  let response;
  try {
    response = await fetchWithTimeout(
      requestUrl,
      {
        method,
        credentials: 'include',
        headers: {
          ...(csrfToken ? { [CSRF_HEADER_NAME]: csrfToken } : {}),
          ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
          ...prepared.headers,
        },
        body: prepared.body,
      },
      timeoutMs,
      signal
    );
  } catch (error) {
    profile.end('network-error');
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
  if (response.ok) {
    profile.end('ok', { status: response.status });
    return data;
  }

  if (response.status === 401) {
    logAuthEvent('request.401', { path: stripQuery(path), authScope: authScope || 'none' });
  }

  const failMsg = () =>
    inferApiFailureMessage(data, { status: response.status, statusText: response.statusText, rawText: rawBody });

  if (response.status === 401 && retryOnUnauthorized && authScope && path !== REFRESH_PATH) {
    try {
      const nextToken = await refreshAccessToken(authScope, { timeoutMs });
      profile.end('401-refreshed');
      return request(path, {
        ...options,
        token: nextToken,
        retryOnUnauthorized: false,
        skipRefreshQueue: true,
      });
    } catch (error) {
      profile.end('401-refresh-failed');
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
    profile.end('401');
    throw createHttpError(failMsg() || 'Unauthorized', { status: 401, refreshAlreadyTried: true });
  }
  profile.end('error', { status: response.status });
  const errorCode = data?.error?.code ?? data?.errorCode ?? null;
  const details = data?.details ?? data?.error?.metadata ?? null;
  throw createHttpError(failMsg(), {
    status: response.status,
    errorCode,
    details,
    responseData: data,
  });
}
