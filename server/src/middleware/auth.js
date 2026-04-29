import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { ApiError } from '../utils/apiError.js';

function readAuthToken(req) {
  const authHeader = req.headers.authorization;
  return authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
}

export function requireAdmin(req, res, next) {
  const token = readAuthToken(req) || req.cookies?.admin_access_token;

  if (!token) {
    return next(new ApiError(401, 'Authentication required'));
  }

  try {
    const payload = jwt.verify(token, env.jwt.accessSecret);
    if (payload.role !== 'admin' && payload.role !== 'super_admin') {
      throw new ApiError(403, 'Admin access required');
    }
    req.user = payload;
    next();
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    return next(new ApiError(401, 'Invalid or expired token'));
  }
}

export function requireStudent(req, res, next) {
  const token = readAuthToken(req);
  if (!token) return next(new ApiError(401, 'Student authentication required'));
  try {
    const payload = jwt.verify(token, env.jwt.accessSecret);
    if (payload.role !== 'student') throw new ApiError(403, 'Student access required');
    req.user = payload;
    next();
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    return next(new ApiError(401, 'Invalid or expired token'));
  }
}
