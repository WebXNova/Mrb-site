import { clearAdminAuth, clearStudentAuth, setAdminAuth, setStudentAuth } from '../auth/session';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api';
const REFRESH_PATH = '/auth/refresh';

let adminRefreshPromise = null;
let studentRefreshPromise = null;

/** Thrown by refresh; callers must not logout on isNetworkError or 5xx. */
export class AuthRefreshError extends Error {
  constructor(message, { status = null, isNetworkError = false } = {}) {
    super(message);
    this.name = 'AuthRefreshError';
    this.status = status;
    this.isNetworkError = Boolean(isNetworkError);
  }
}

export function isRefreshAuthRevokedError(err) {
  if (!(err instanceof AuthRefreshError)) return false;
  if (err.isNetworkError) return false;
  const s = err.status;
  return s === 401 || s === 403;
}

function base64UrlDecodeSegment(segment) {
  const b64 = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), '=');
  return JSON.parse(atob(padded));
}

/** Missing token, bad shape, unreadable payload, no exp, or exp in the past → try cookie refresh. */
export function shouldAttemptAccessRefresh(token) {
  if (!token) return true;
  const parts = token.split('.');
  if (parts.length !== 3) return true;
  try {
    const payload = base64UrlDecodeSegment(parts[1]);
    if (typeof payload.exp !== 'number') return true;
    return payload.exp * 1000 <= Date.now();
  } catch {
    return true;
  }
}

async function parseRefreshResponse(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new AuthRefreshError(payload.message || 'Session refresh failed', {
      status: response.status,
    });
  }
  const nextToken = payload?.data?.accessToken;
  if (!nextToken) {
    throw new AuthRefreshError(payload.message || 'Session refresh failed', {
      status: response.status || 502,
    });
  }
  return { nextToken, payload };
}

async function postRefresh(role) {
  let response;
  try {
    response = await fetch(`${API_BASE}${REFRESH_PATH}`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'x-auth-role': role,
      },
    });
  } catch (e) {
    if (e instanceof TypeError) {
      throw new AuthRefreshError('Network error', { isNetworkError: true });
    }
    throw e;
  }
  const { nextToken, payload } = await parseRefreshResponse(response);
  return { nextToken, payload };
}

/** Single in-flight refresh for admin (all callers share one promise). */
export function refreshAdminAccessToken() {
  if (adminRefreshPromise) return adminRefreshPromise;

  adminRefreshPromise = (async () => {
    try {
      const { nextToken, payload } = await postRefresh('admin');
      const maybeUser = payload?.data?.user || payload?.data?.admin || null;
      setAdminAuth(nextToken, maybeUser);
      return nextToken;
    } finally {
      adminRefreshPromise = null;
    }
  })();

  return adminRefreshPromise;
}

/** Single in-flight refresh for student (all callers share one promise). */
export function refreshStudentAccessToken() {
  if (studentRefreshPromise) return studentRefreshPromise;

  studentRefreshPromise = (async () => {
    try {
      const { nextToken, payload } = await postRefresh('student');
      const maybeUser = payload?.data?.user || payload?.data?.student || null;
      setStudentAuth(nextToken, maybeUser);
      return nextToken;
    } finally {
      studentRefreshPromise = null;
    }
  })();

  return studentRefreshPromise;
}

/** Bootstrap: only clear session when refresh proves refresh token is dead (401/403). */
export async function bootstrapAdminSession() {
  try {
    await refreshAdminAccessToken();
    return true;
  } catch (e) {
    if (isRefreshAuthRevokedError(e)) clearAdminAuth();
    return false;
  }
}

export async function bootstrapStudentSession() {
  try {
    await refreshStudentAccessToken();
    return true;
  } catch (e) {
    if (isRefreshAuthRevokedError(e)) clearStudentAuth();
    return false;
  }
}
