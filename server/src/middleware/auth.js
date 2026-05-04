import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { mysqlPool } from '../config/mysql.js';
import { logActivity } from '../services/activityLog.service.js';
import { ApiError } from '../utils/apiError.js';

function readAuthToken(req) {
  const authHeader = req.headers.authorization;
  return authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
}

function verifyAccessToken(token) {
  return jwt.verify(token, env.jwt.accessSecret, {
    algorithms: ['HS256'],
    issuer: env.jwt.issuer,
    audience: env.jwt.audience,
  });
}

async function assertTokenVersion(payload) {
  if (env.security.allowLegacyTokenVersion && payload.tokenVersion === undefined) {
    return;
  }
  if (payload.tokenVersion === undefined) {
    throw new ApiError(401, 'Invalid token payload');
  }
  const [rows] = await mysqlPool.query(`SELECT token_version FROM users WHERE id = ? LIMIT 1`, [payload.id]);
  const user = rows[0];
  if (!user) throw new ApiError(401, 'Authentication required');
  if (Number(user.token_version || 0) !== Number(payload.tokenVersion || 0)) {
    throw new ApiError(401, 'Session expired. Please sign in again.');
  }
}

async function assertAccessSessionActive(payload) {
  if (!payload?.sid) {
    throw new ApiError(401, 'Invalid token payload');
  }
  const [rows] = await mysqlPool.query(
    `SELECT id FROM auth_sessions WHERE id = ? AND user_id = ? AND revoked_at IS NULL LIMIT 1`,
    [payload.sid, payload.id]
  );
  if (!rows[0]) {
    throw new ApiError(401, 'Session expired. Please sign in again.');
  }
}

export async function requireAdmin(req, res, next) {
  const token = readAuthToken(req);

  if (!token) {
    return next(new ApiError(401, 'Authentication required'));
  }

  try {
    const payload = verifyAccessToken(token);
    if (payload.type && payload.type !== 'access') {
      throw new ApiError(401, 'Invalid token type');
    }
    if (!payload?.id || !payload?.role) {
      throw new ApiError(401, 'Invalid token payload');
    }
    if (payload.role !== 'admin' && payload.role !== 'super_admin') {
      throw new ApiError(403, 'Admin access required');
    }
    await assertTokenVersion(payload);
    await assertAccessSessionActive(payload);
    req.user = payload;
    next();
  } catch (error) {
    void logActivity({
      role: 'admin',
      action: 'auth.invalid_token',
      entityType: 'auth',
      metadata: { path: req.originalUrl, reason: error.message },
    });
    if (error instanceof ApiError) return next(error);
    return next(new ApiError(401, 'Invalid or expired token'));
  }
}

export async function requireStudent(req, res, next) {
  const token = readAuthToken(req);
  if (!token) return next(new ApiError(401, 'Student authentication required'));
  try {
    const payload = verifyAccessToken(token);
    if (payload.type && payload.type !== 'access') {
      throw new ApiError(401, 'Invalid token type');
    }
    if (!payload?.id || !payload?.role) {
      throw new ApiError(401, 'Invalid token payload');
    }
    await assertTokenVersion(payload);
    await assertAccessSessionActive(payload);
    if (payload.role !== 'student') throw new ApiError(403, 'Student access required');
    req.user = payload;
    next();
  } catch (error) {
    void logActivity({
      role: 'student',
      action: 'auth.invalid_token',
      entityType: 'auth',
      metadata: { path: req.originalUrl, reason: error.message },
    });
    if (error instanceof ApiError) return next(error);
    return next(new ApiError(401, 'Invalid or expired token'));
  }
}
