/**
 * Classifiers for `/auth/refresh` failures. Drive retry + whether to wipe local auth.
 * Keeps UX safe: only confirmed auth termination clears HttpOnly-independent local state.
 */

export const RefreshFailureKind = /** @type {const} */ ({
  REVOKED_SESSION: 'REVOKED_SESSION',
  /** Stale refresh token after another tab rotated; session still valid — retry/wait. */
  REFRESH_SUPERSEDED: 'REFRESH_SUPERSEDED',
  AUTH_REFRESH_DENIED: 'AUTH_REFRESH_DENIED',
  FORBIDDEN_ACCOUNT: 'FORBIDDEN_ACCOUNT',
  CSRF_MISMATCH: 'CSRF_MISMATCH',
  ORIGIN_POLICY: 'ORIGIN_POLICY',
  FORBIDDEN_POLICY: 'FORBIDDEN_POLICY',
  RATE_LIMIT: 'RATE_LIMIT',
  BACKEND_ERROR: 'BACKEND_ERROR',
  MALFORMED_RESPONSE: 'MALFORMED_RESPONSE',
  NETWORK_FAILURE: 'NETWORK_FAILURE',
  TIMEOUT: 'TIMEOUT',
  UNKNOWN: 'UNKNOWN',
});

/** Clear local session display state + guest transition (refresh/cookies invalidated). */
export function isConfirmedAuthTerminationKind(kind) {
  return (
    kind === RefreshFailureKind.REVOKED_SESSION ||
    kind === RefreshFailureKind.AUTH_REFRESH_DENIED ||
    kind === RefreshFailureKind.FORBIDDEN_ACCOUNT
  );
}

export function isTransientRefreshKind(kind) {
  return (
    kind === RefreshFailureKind.NETWORK_FAILURE ||
    kind === RefreshFailureKind.TIMEOUT ||
    kind === RefreshFailureKind.BACKEND_ERROR ||
    kind === RefreshFailureKind.RATE_LIMIT
  );
}

function normMsg(value) {
  return String(value || '').toLowerCase();
}

/**
 * @param {number} status
 * @param {string} message - API `message` or fallback
 * @param {string | null} [errorCode] - API `error.code`
 */
export function classifyRefreshHttpFailure(status, message, errorCode = null) {
  const m = normMsg(message);
  const code = String(errorCode || '').toUpperCase();
  if (!Number.isFinite(status)) return RefreshFailureKind.UNKNOWN;

  if (status === 401) {
    if (code === 'REFRESH_SUPERSEDED' || code === 'REFRESH_REJECTED') {
      return RefreshFailureKind.REFRESH_SUPERSEDED;
    }
    if (code === 'REFRESH_REPLAY_REJECTED') return RefreshFailureKind.REVOKED_SESSION;
    return RefreshFailureKind.REVOKED_SESSION;
  }

  if (status === 403) {
    if (m.includes('csrf')) return RefreshFailureKind.CSRF_MISMATCH;
    if (m.includes('suspended')) return RefreshFailureKind.FORBIDDEN_ACCOUNT;
    if (m.includes('origin header required') || m.includes('origin not allowed')) {
      return RefreshFailureKind.ORIGIN_POLICY;
    }
    // Wrong-role cookie vs x-auth-role, or post-rotation guard in refreshAuth
    if (m.includes('admin refresh token required') || m.includes('student refresh token required')) {
      return RefreshFailureKind.AUTH_REFRESH_DENIED;
    }
    return RefreshFailureKind.FORBIDDEN_POLICY;
  }

  if (status === 429) return RefreshFailureKind.RATE_LIMIT;

  if (status >= 500 && status <= 599) return RefreshFailureKind.BACKEND_ERROR;

  return RefreshFailureKind.UNKNOWN;
}
