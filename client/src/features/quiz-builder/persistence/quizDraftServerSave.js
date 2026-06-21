/**
 * A2 — Server draft save helpers (PUT /api/tests/:testId/quiz-draft).
 */

export const DRAFT_VERSION_CONFLICT = 'DRAFT_VERSION_CONFLICT';
export const MAX_SERVER_SAVE_RETRIES = 3;
export const SERVER_SAVE_RETRY_DELAYS_MS = [1000, 2000, 4000];

/**
 * @param {unknown} error
 * @returns {{
 *   kind: 'conflict'|'validation'|'auth'|'forbidden'|'network'|'timeout'|'server'|'unknown',
 *   retryable: boolean,
 *   status: number|null,
 *   errorCode: string|null,
 *   message: string,
 * }}
 */
export function classifyServerSaveError(error) {
  const status = Number(error?.status) || null;
  const errorCode = error?.errorCode ?? error?.responseData?.error?.code ?? null;
  const message = error instanceof Error ? error.message : 'Save failed.';

  if (errorCode === DRAFT_VERSION_CONFLICT || status === 409) {
    return {
      kind: 'conflict',
      retryable: true,
      status,
      errorCode,
      message: 'Draft was modified in another session.',
    };
  }

  if (status === 401) {
    return {
      kind: 'auth',
      retryable: false,
      status,
      errorCode,
      message: 'Session expired. Sign in again to save.',
    };
  }

  if (status === 403) {
    return {
      kind: 'forbidden',
      retryable: false,
      status,
      errorCode,
      message: 'You do not have permission to save this draft.',
    };
  }

  if (status === 422) {
    return {
      kind: 'validation',
      retryable: false,
      status,
      errorCode,
      message: message || 'Draft failed server validation.',
    };
  }

  if (status === 408) {
    return {
      kind: 'timeout',
      retryable: true,
      status,
      errorCode,
      message: 'Save timed out. Will retry.',
    };
  }

  if (status === 502 || status === 503 || status === 504) {
    return {
      kind: 'server',
      retryable: true,
      status,
      errorCode,
      message: 'Server unavailable. Will retry.',
    };
  }

  if (
    status === 0 ||
    message.includes('connect') ||
    message.includes('network') ||
    message.includes('Temporary auth')
  ) {
    return {
      kind: 'network',
      retryable: true,
      status,
      errorCode,
      message: 'Network error. Saved locally; will retry.',
    };
  }

  return {
    kind: 'unknown',
    retryable: false,
    status,
    errorCode,
    message,
  };
}

/**
 * Stable fingerprint to skip duplicate PUTs when payload unchanged.
 *
 * @param {object} draftPayload
 */
export function fingerprintDraftPayload(draftPayload) {
  try {
    return JSON.stringify({
      testId: draftPayload.testId,
      questions: draftPayload.questions,
      totalPoints: draftPayload.totalPoints,
    });
  } catch {
    return null;
  }
}

/**
 * @param {number} attempt Zero-based retry attempt index.
 */
export function serverSaveRetryDelayMs(attempt) {
  const delays = SERVER_SAVE_RETRY_DELAYS_MS;
  return delays[Math.min(Math.max(0, attempt), delays.length - 1)];
}
