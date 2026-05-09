import { logActivity } from '../services/activityLog.service.js';
import { ApiError } from '../utils/apiError.js';
import { evaluateAccessRequest } from '../services/authDecisionEngine.js';
import { env } from '../config/env.js';
import { sanitizePath } from '../utils/logSanitizer.js';

export async function requireAdmin(req, res, next) {
  try {
    const payload = await evaluateAccessRequest(req, { expectedRole: 'admin' });
    req.user = payload;
    next();
  } catch (error) {
    void logActivity({
      role: 'admin',
      action: 'auth.invalid_token',
      entityType: 'auth',
      metadata: { path: sanitizePath(req.originalUrl), reason: error.message },
    });
    if (error instanceof ApiError) return next(error);
    return next(new ApiError(401, 'Invalid or expired token'));
  }
}

export async function requireStudent(req, res, next) {
  try {
    const payload = await evaluateAccessRequest(req, { expectedRole: 'student' });
    req.user = payload;
    next();
  } catch (error) {
    void logActivity({
      role: 'student',
      action: 'auth.invalid_token',
      entityType: 'auth',
      metadata: { path: sanitizePath(req.originalUrl), reason: error.message },
    });
    if (error instanceof ApiError) return next(error);
    return next(new ApiError(401, 'Invalid or expired token'));
  }
}

export function rejectAuthHeaderInProduction(req, res, next) {
  if (env.nodeEnv === 'production' && req.headers.authorization) {
    return next(new ApiError(400, 'Authorization header is not allowed in production'));
  }
  return next();
}
