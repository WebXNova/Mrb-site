const SESSION_PREFIX = 'test_attempt_';

export function getAttemptSession(slug) {
  try {
    return JSON.parse(sessionStorage.getItem(`${SESSION_PREFIX}${slug}`) || '{}');
  } catch {
    return {};
  }
}

/**
 * @param {string} slug
 * @param {{ attemptId: number, attemptToken: string, expiresAt?: string|null }} payload
 */
export function setAttemptSession(slug, payload) {
  sessionStorage.setItem(`${SESSION_PREFIX}${slug}`, JSON.stringify(payload));
}

export function clearAttemptSession(slug) {
  sessionStorage.removeItem(`${SESSION_PREFIX}${slug}`);
}
