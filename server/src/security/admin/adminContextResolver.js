import { requireAdmin } from '../../middleware/auth.js';

/**
 * Admin security phase 1A: compatibility wrapper resolving authenticated admin context.
 * Delegates to requireAdmin — preserves req.user, decision engine, and activity logging.
 *
 * @type {import('express').RequestHandler}
 */
export function adminContextResolver(req, res, next) {
  return requireAdmin(req, res, next);
}
