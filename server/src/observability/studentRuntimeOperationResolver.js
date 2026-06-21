/**
 * Resolve canonical student runtime stack + operation from an Express request.
 */

import { STUDENT_RUNTIME_STACK } from '../runtime/studentRuntimeCanonical.js';

/**
 * @param {import('express').Request} req
 * @returns {{ stack: 'slug' | 'portal' | 'legacy' | 'unknown', operation: string }}
 */
export function resolveStudentRuntimeOperation(req) {
  const method = String(req.method || 'GET').toUpperCase();
  const path = String(req.path || req.originalUrl || '').split('?')[0];

  if (path.startsWith('/api/attempt') || path.startsWith('/api/attempts')) {
    return resolveLegacyOperation(method, path);
  }

  if (path.startsWith('/api/student')) {
    return resolvePortalOperation(method, path);
  }

  if (path.startsWith('/api/tests/')) {
    return resolveSlugOperation(method, path);
  }

  if (path.startsWith('/api/courses/public/tests/')) {
    return { stack: STUDENT_RUNTIME_STACK.SLUG, operation: 'publicMeta' };
  }

  return { stack: 'unknown', operation: 'unknown' };
}

/**
 * @param {string} method
 * @param {string} path
 */
function resolveSlugOperation(method, path) {
  if (method === 'GET' && /\/prep$/.test(path)) {
    return { stack: STUDENT_RUNTIME_STACK.SLUG, operation: 'prep' };
  }
  if (method === 'POST' && /\/verify-code$/.test(path)) {
    return { stack: STUDENT_RUNTIME_STACK.SLUG, operation: 'startOrResume' };
  }
  if (method === 'GET' && /\/attempts\/[^/]+\/start$/.test(path)) {
    return { stack: STUDENT_RUNTIME_STACK.SLUG, operation: 'loadAttempt' };
  }
  if (method === 'PATCH' && /\/attempts\/[^/]+\/answers$/.test(path)) {
    return { stack: STUDENT_RUNTIME_STACK.SLUG, operation: 'saveAnswer' };
  }
  if (method === 'POST' && /\/attempts\/[^/]+\/submit$/.test(path)) {
    return { stack: STUDENT_RUNTIME_STACK.SLUG, operation: 'submitAttempt' };
  }
  if (method === 'GET' && /\/attempts\/[^/]+\/result$/.test(path)) {
    return { stack: STUDENT_RUNTIME_STACK.SLUG, operation: 'slugResult' };
  }
  return { stack: STUDENT_RUNTIME_STACK.SLUG, operation: 'slug_other' };
}

/**
 * @param {string} method
 * @param {string} path
 */
function resolvePortalOperation(method, path) {
  if (method === 'GET' && path === '/api/student/tests') {
    return { stack: STUDENT_RUNTIME_STACK.PORTAL, operation: 'portalListTests' };
  }
  if (method === 'POST' && /^\/api\/student\/tests\/[^/]+\/start$/.test(path)) {
    return { stack: STUDENT_RUNTIME_STACK.PORTAL, operation: 'portalStart' };
  }
  if (method === 'GET' && /^\/api\/student\/attempts\/[^/]+$/.test(path)) {
    return { stack: STUDENT_RUNTIME_STACK.PORTAL, operation: 'portalLoadAttempt' };
  }
  if (method === 'POST' && /^\/api\/student\/attempts\/[^/]+\/answer$/.test(path)) {
    return { stack: STUDENT_RUNTIME_STACK.PORTAL, operation: 'portalSaveAnswer' };
  }
  if (method === 'GET' && /^\/api\/student\/results\/[^/]+$/.test(path)) {
    return { stack: STUDENT_RUNTIME_STACK.PORTAL, operation: 'portalResult' };
  }
  return { stack: STUDENT_RUNTIME_STACK.PORTAL, operation: 'portal_other' };
}

/**
 * @param {string} method
 * @param {string} path
 */
function resolveLegacyOperation(method, path) {
  if (method === 'POST' && /\/submit$/.test(path)) {
    return { stack: STUDENT_RUNTIME_STACK.LEGACY, operation: 'legacySubmit' };
  }
  if (method === 'GET' && /\/result$/.test(path)) {
    return { stack: STUDENT_RUNTIME_STACK.LEGACY, operation: 'legacyResult' };
  }
  return { stack: STUDENT_RUNTIME_STACK.LEGACY, operation: 'legacy_other' };
}
