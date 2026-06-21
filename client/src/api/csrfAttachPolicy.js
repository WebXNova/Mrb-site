import { isAdminApiMutationPrefix } from '../config/adminPaths.js';

export const REFRESH_PATH = '/auth/refresh';

const CSRF_ALWAYS_PATHS = new Set([
  REFRESH_PATH,
  '/auth/logout',
  '/auth/student/logout',
  '/auth/teacher/logout',
  '/auth/logout-all',
]);

const CSRF_MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function stripQuery(path) {
  return String(path || '').split('?')[0];
}

function isMutatingMethod(method) {
  return CSRF_MUTATING_METHODS.has(String(method || 'GET').toUpperCase());
}

function isQuestionBankMutationPath(path) {
  try {
    if (isAdminApiMutationPrefix(path) && (path.includes('/questions') || path.endsWith('/questions'))) {
      return true;
    }
  } catch {
    /* shell not configured — fall through */
  }
  return false;
}

/** Quiz Builder draft APIs under the secret admin mount. */
function isQuizDraftMutationPath(path) {
  try {
    return isAdminApiMutationPrefix(path) && /\/tests\/[^/]+\/quiz-draft$/.test(path);
  } catch {
    return false;
  }
}

/** Student portal test runtime writes (student.routes requireCsrf). */
function isStudentTestWritePath(path) {
  return (
    /^\/student\/tests\/[^/]+\/start$/.test(path) ||
    /^\/student\/attempts\/[^/]+\/answer$/.test(path)
  );
}

/** Slug runtime attempt writes (`PATCH|POST /tests/:slug/attempts/:attemptId/*`). */
function isSlugTestWritePath(path) {
  return (
    /^\/tests\/[^/]+\/attempts\/[^/]+\/answers$/.test(path) ||
    /^\/tests\/[^/]+\/attempts\/[^/]+\/submit$/.test(path)
  );
}

/**
 * Whether `request()` should attach the `x-csrf-token` header for this API call.
 * Safe methods on read-only routes are excluded unless listed in CSRF_ALWAYS_PATHS.
 */
export function shouldAttachCsrf(path, method = 'GET') {
  const p = stripQuery(path);
  if (CSRF_ALWAYS_PATHS.has(p)) return true;
  if (!isMutatingMethod(method)) return false;
  try {
    if (isAdminApiMutationPrefix(p)) return true;
  } catch {
    /* shell not configured */
  }
  /** Question Bank mutations under secret admin mount. */
  if (isQuestionBankMutationPath(p)) return true;
  /** Quiz Builder draft mutations (`PUT|DELETE /tests/:testId/quiz-draft`). */
  if (isQuizDraftMutationPath(p)) return true;
  /** Student portal test start + answer autosave */
  if (isStudentTestWritePath(p)) return true;
  /** Student enrollment mutations */
  if (p === '/enrollments' || p === '/enrollments/draft') return true;
  /** Payment checkout session creation */
  if (p === '/payments/create-session') return true;
  /** Slug test runtime autosave + submit */
  if (isSlugTestWritePath(p)) return true;
  /** Student Q&A mutations */
  if (p === '/student/questions' || p === '/student/questions/attachment' || p === '/student/questions/recording') return true;
  /** Teacher Q&A answer mutations */
  if (p === '/teacher/questions/answer/attachment' || p === '/teacher/questions/answer/recording') return true;
  if (/^\/teacher\/questions\/[^/]+\/answer$/.test(p)) return true;
  if (/^\/teacher\/questions\/[^/]+\/pin$/.test(p)) return true;
  /** Teacher-initiated thread chat messages */
  if (/^\/teacher\/question-threads\/[^/]+\/messages$/.test(p)) return true;
  return false;
}
