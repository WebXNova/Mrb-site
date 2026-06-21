import { rejectAdminBearer } from '../security/admin/rejectAdminBearer.js';
import { requireAdmin } from './auth.js';
import { ApiError } from '../utils/apiError.js';
import { evaluateMetricsAccess } from './observabilityAccess.util.js';

export {
  evaluateMetricsAccess,
  isInternalObservabilityClient,
  isMetricsScraperAuthorized,
  getMetricsScraperToken,
} from './observabilityAccess.util.js';

function runMiddleware(middleware, req, res) {
  return new Promise((resolve, reject) => {
    middleware(req, res, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

/**
 * Production: admin cookie, internal network, or METRICS_SCRAPER_TOKEN.
 * Development: open (monitoring unchanged).
 *
 * @type {import('express').RequestHandler}
 */
export async function requireMetricsAccess(req, res, next) {
  const decision = evaluateMetricsAccess(req);
  if (decision.allowed) {
    return next();
  }

  try {
    await runMiddleware(rejectAdminBearer, req, res);
    await runMiddleware(requireAdmin, req, res);
    return next();
  } catch (error) {
    if (error instanceof ApiError) {
      return next(error);
    }
    return next(new ApiError(401, 'Metrics access denied'));
  }
}

/**
 * Sets req.user when a valid admin session is present; never fails the request.
 *
 * @type {import('express').RequestHandler}
 */
export async function optionalAdminContext(req, res, next) {
  try {
    await runMiddleware(rejectAdminBearer, req, res);
    await runMiddleware(requireAdmin, req, res);
  } catch {
    /* anonymous readiness probe */
  }
  return next();
}
