const SESSION_PREFIX = 'test_attempt_';

/**
 * Attempt session metadata — slug runtime only.
 *
 * SECURITY: Attempt JWT lives in HttpOnly cookie (`test_attempt_token`).
 * sessionStorage holds only non-secret routing metadata (attemptId, expiresAt).
 * XSS cannot read the attempt credential.
 */

/**
 * @param {string} slug
 * @returns {{ attemptId?: number|null, expiresAt?: string|null }}
 */
export function getAttemptSession(slug) {
  try {
    const raw = JSON.parse(sessionStorage.getItem(`${SESSION_PREFIX}${slug}`) || '{}');
    return {
      attemptId: raw.attemptId ?? null,
      expiresAt: raw.expiresAt ?? null,
    };
  } catch {
    return {};
  }
}

/**
 * @param {string} slug
 * @param {{ attemptId: number, expiresAt?: string|null }} payload
 */
export function setAttemptSession(slug, payload) {
  const safe = {
    attemptId: payload.attemptId ?? null,
    expiresAt: payload.expiresAt ?? null,
  };
  sessionStorage.setItem(`${SESSION_PREFIX}${slug}`, JSON.stringify(safe));
}

/**
 * @param {string} slug
 */
export function clearAttemptSession(slug) {
  sessionStorage.removeItem(`${SESSION_PREFIX}${slug}`);
}
