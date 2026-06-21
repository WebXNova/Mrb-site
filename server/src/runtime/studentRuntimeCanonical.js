/**
 * Canonical student test runtime — single source of truth for G-RT-01 unification.
 *
 * Slug runtime (/api/tests/:slug/*) is the primary taking/submit flow.
 * Portal runtime (/api/student/*) is the dashboard + result read path.
 * Legacy runtime (/api/attempt, /api/attempts) is deprecated — use migration map below.
 */

/** @typedef {'slug' | 'portal' | 'legacy'} StudentRuntimeStack */

export const STUDENT_RUNTIME_STACK = Object.freeze({
  SLUG: 'slug',
  PORTAL: 'portal',
  LEGACY: 'legacy',
});

/**
 * Canonical runtime endpoints (CEE entitlement required except public meta).
 * @type {Readonly<Record<string, { method: string, path: string, stack: StudentRuntimeStack, cee: boolean }>>}
 */
export const CANONICAL_STUDENT_RUNTIME_ROUTES = Object.freeze({
  publicMeta: {
    method: 'GET',
    path: '/api/courses/public/tests/:slug',
    stack: STUDENT_RUNTIME_STACK.SLUG,
    cee: false,
  },
  prep: {
    method: 'GET',
    path: '/api/tests/:slug/prep',
    stack: STUDENT_RUNTIME_STACK.SLUG,
    cee: true,
  },
  startOrResume: {
    method: 'POST',
    path: '/api/tests/:slug/verify-code',
    stack: STUDENT_RUNTIME_STACK.SLUG,
    cee: true,
  },
  loadAttempt: {
    method: 'GET',
    path: '/api/tests/:slug/attempts/:attemptId/start',
    stack: STUDENT_RUNTIME_STACK.SLUG,
    cee: true,
  },
  saveAnswer: {
    method: 'PATCH',
    path: '/api/tests/:slug/attempts/:attemptId/answers',
    stack: STUDENT_RUNTIME_STACK.SLUG,
    cee: true,
  },
  submitAttempt: {
    method: 'POST',
    path: '/api/tests/:slug/attempts/:attemptId/submit',
    stack: STUDENT_RUNTIME_STACK.SLUG,
    cee: true,
  },
  slugResult: {
    method: 'GET',
    path: '/api/tests/:slug/attempts/:attemptId/result',
    stack: STUDENT_RUNTIME_STACK.SLUG,
    cee: true,
  },
  portalListTests: {
    method: 'GET',
    path: '/api/student/tests',
    stack: STUDENT_RUNTIME_STACK.PORTAL,
    cee: true,
  },
  portalStart: {
    method: 'POST',
    path: '/api/student/tests/:testId/start',
    stack: STUDENT_RUNTIME_STACK.PORTAL,
    cee: true,
  },
  portalLoadAttempt: {
    method: 'GET',
    path: '/api/student/attempts/:attemptId',
    stack: STUDENT_RUNTIME_STACK.PORTAL,
    cee: true,
  },
  portalSaveAnswer: {
    method: 'POST',
    path: '/api/student/attempts/:attemptId/answer',
    stack: STUDENT_RUNTIME_STACK.PORTAL,
    cee: true,
  },
  portalResult: {
    method: 'GET',
    path: '/api/student/results/:attemptId',
    stack: STUDENT_RUNTIME_STACK.PORTAL,
    cee: true,
  },
});

/**
 * Deprecated legacy runtime — all map to canonical replacements.
 * @type {Readonly<Record<string, { legacy: { method: string, path: string }, canonical: keyof typeof CANONICAL_STUDENT_RUNTIME_ROUTES, bypassesBeforeGrt02: string[] }>>}
 */
export const LEGACY_RUNTIME_MIGRATION_MAP = Object.freeze({
  getActiveAttempt: {
    legacy: { method: 'GET', path: '/api/attempt/tests/:testId/active' },
    canonical: 'startOrResume',
    bypassesBeforeGrt02: ['cee_entitlement', 'enrollment_revalidation', 'course_scope'],
  },
  getAttemptById: {
    legacy: { method: 'GET', path: '/api/attempt/:attemptId' },
    canonical: 'loadAttempt',
    bypassesBeforeGrt02: ['cee_entitlement', 'enrollment_revalidation'],
  },
  postAnswer: {
    legacy: { method: 'POST', path: '/api/attempts/:attempt_id/answers' },
    canonical: 'saveAnswer',
    bypassesBeforeGrt02: ['cee_entitlement', 'enrollment_revalidation'],
  },
  postSubmit: {
    legacy: { method: 'POST', path: '/api/attempts/:attempt_id/submit' },
    canonical: 'submitAttempt',
    bypassesBeforeGrt02: ['cee_entitlement', 'enrollment_revalidation'],
  },
  getResult: {
    legacy: { method: 'GET', path: '/api/attempts/:attempt_id/result' },
    canonical: 'portalResult',
    bypassesBeforeGrt02: ['cee_entitlement', 'enrollment_revalidation', 'attempt_token_on_result'],
  },
});

/** Error code returned when legacy runtime is disabled (default). */
export const LEGACY_STUDENT_RUNTIME_DISABLED = 'LEGACY_STUDENT_RUNTIME_DISABLED';

/**
 * @param {string} legacyPath — e.g. /api/attempts/42/result
 * @returns {keyof typeof LEGACY_RUNTIME_MIGRATION_MAP|null}
 */
export function matchLegacyRuntimeOperation(legacyPath) {
  const normalized = String(legacyPath || '').split('?')[0].replace(/\/+$/, '');
  if (/^\/api\/attempt\/tests\/[^/]+\/active$/i.test(normalized)) {
    return 'getActiveAttempt';
  }
  if (/^\/api\/attempt\/[^/]+$/i.test(normalized) && !normalized.includes('/tests/')) {
    return 'getAttemptById';
  }
  if (/^\/api\/attempts\/[^/]+\/answers$/i.test(normalized)) {
    return 'postAnswer';
  }
  if (/^\/api\/attempts\/[^/]+\/submit$/i.test(normalized)) {
    return 'postSubmit';
  }
  if (/^\/api\/attempts\/[^/]+\/result$/i.test(normalized)) {
    return 'getResult';
  }
  return null;
}
