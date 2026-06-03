export const REFRESH_PATH = '/auth/refresh';

const CSRF_ALWAYS_PATHS = new Set([
  REFRESH_PATH,
  '/auth/logout',
  '/auth/student/logout',
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
  return path === '/questions' || path.startsWith('/questions/');
}

/**
 * Whether `request()` should attach the `x-csrf-token` header for this API call.
 * Safe methods on read-only routes are excluded unless listed in CSRF_ALWAYS_PATHS.
 */
export function shouldAttachCsrf(path, method = 'GET') {
  const p = stripQuery(path);
  if (CSRF_ALWAYS_PATHS.has(p)) return true;
  if (!isMutatingMethod(method)) return false;
  if (p.startsWith('/admin/')) return true;
  /** Admin enrollment mutations use `/enrollments/admin` (outside `/api/admin` mount). */
  if (p.startsWith('/enrollments/admin')) return true;
  /** Question Bank mutations (`POST /questions`, `PUT|DELETE /questions/:id`, etc.). */
  if (isQuestionBankMutationPath(p)) return true;
  return false;
}
