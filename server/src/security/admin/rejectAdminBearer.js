import { rejectAuthHeaderInProduction } from '../../middleware/auth.js';

/**
 * Admin security phase 1A: compatibility wrapper for bearer rejection in production.
 * Delegates to existing middleware — no transport or JWT changes.
 *
 * @type {import('express').RequestHandler}
 */
export function rejectAdminBearer(req, res, next) {
  return rejectAuthHeaderInProduction(req, res, next);
}
