import { logActivity } from '../services/activityLog.service.js';
import { ApiError } from '../utils/apiError.js';
import { evaluateAccessRequest } from '../services/authDecisionEngine.js';
import { env } from '../config/env.js';
import { sanitizePath } from '../utils/logSanitizer.js';
import { logBearerTokenRejected, isProductionAuthMode } from '../services/authSecurity.service.js';

function hasBearerAuthorization(req) {
  return typeof req.headers.authorization === 'string' && req.headers.authorization.startsWith('Bearer ');
}

function inferBearerRejectionRole(req) {
  const path = String(req.originalUrl || req.path || '');
  if (path.includes('/teacher')) return 'teacher';
  if (path.includes('/student')) return 'student';
  return 'admin';
}

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

export async function requireTeacher(req, res, next) {
  try {
    const payload = await evaluateAccessRequest(req, { expectedRole: 'teacher' });
    req.user = payload;
    next();
  } catch (error) {
    void logActivity({
      role: 'teacher',
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

export async function authMiddleware(req, res, next) {
  if (isProductionAuthMode() && hasBearerAuthorization(req)) {
    await logBearerTokenRejected(req, 'student');
    return next(
      new ApiError(401, 'Cookie authentication required in production', {
        code: 'BEARER_REJECTED_IN_PRODUCTION',
        error_code: 'BEARER_REJECTED_IN_PRODUCTION',
      })
    );
  }

  const hasCookieToken = Boolean(req.cookies?.student_access_token);
  if (!hasCookieToken && !hasBearerAuthorization(req)) {
    return next(new ApiError(401, 'Login required'));
  }

  try {
    const payload = await evaluateAccessRequest(req, { expectedRole: 'student' });
    req.user = payload;
    return next();
  } catch (error) {
    void logActivity({
      role: 'student',
      action: 'auth.invalid_token',
      entityType: 'auth',
      metadata: { path: sanitizePath(req.originalUrl), reason: error.message },
    });
    return next(new ApiError(401, 'Invalid or expired token'));
  }
}

export function rejectAuthHeaderInProduction(req, res, next) {
  if (isProductionAuthMode() && hasBearerAuthorization(req)) {
    void logBearerTokenRejected(req, inferBearerRejectionRole(req));
    return next(
      new ApiError(401, 'Authorization header is not allowed in production', {
        code: 'BEARER_REJECTED_IN_PRODUCTION',
        error_code: 'BEARER_REJECTED_IN_PRODUCTION',
      })
    );
  }
  return next();
}

/** Reject Bearer tokens on teacher API surfaces in production (cookie-only). */
export function rejectTeacherBearerInProduction(req, res, next) {
  if (isProductionAuthMode() && hasBearerAuthorization(req)) {
    void logBearerTokenRejected(req, 'teacher');
    return next(
      new ApiError(401, 'Cookie authentication required in production', {
        code: 'BEARER_REJECTED_IN_PRODUCTION',
        error_code: 'BEARER_REJECTED_IN_PRODUCTION',
      })
    );
  }
  return next();
}

/** Reject Bearer tokens on student API surfaces in production (cookie-only). */
export function rejectStudentBearerInProduction(req, res, next) {
  if (isProductionAuthMode() && hasBearerAuthorization(req)) {
    void logBearerTokenRejected(req, 'student');
    return next(
      new ApiError(401, 'Cookie authentication required in production', {
        code: 'BEARER_REJECTED_IN_PRODUCTION',
        error_code: 'BEARER_REJECTED_IN_PRODUCTION',
      })
    );
  }
  return next();
}
