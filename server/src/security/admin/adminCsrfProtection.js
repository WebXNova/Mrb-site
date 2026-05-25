import { requireCsrf } from '../../middleware/csrf.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Admin security phase 1A: centralized CSRF wrapper (safe methods skip; mutations use requireCsrf).
 * Does not replace per-route usage until integrated.
 *
 * @type {import('express').RequestHandler}
 */
export function adminCsrfProtection(req, res, next) {
  const method = String(req.method || 'GET').toUpperCase();
  if (SAFE_METHODS.has(method)) {
    return next();
  }
  return requireCsrf(req, res, next);
}
