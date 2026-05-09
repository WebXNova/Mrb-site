import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { mysqlPool } from '../config/mysql.js';
import { ApiError } from '../utils/apiError.js';

function parseBearer(authHeader) {
  return authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
}

function readAccessToken(req, role) {
  const cookieName = role === 'student' ? 'student_access_token' : 'admin_access_token';
  const cookieToken = req.cookies?.[cookieName] || null;
  const bearerToken = parseBearer(req.headers.authorization);

  if (env.nodeEnv === 'production' && bearerToken) {
    throw new ApiError(400, 'Authorization header is not allowed in production');
  }
  return cookieToken || bearerToken || null;
}

function verifyAccessJwt(token) {
  const secrets = [env.jwt.accessSecret, ...env.jwt.previousAccessSecrets];
  for (const secret of secrets) {
    try {
      return jwt.verify(token, secret, {
        algorithms: ['HS256'],
        issuer: env.jwt.issuer,
        audience: env.jwt.audience,
      });
    } catch {
      // try next key
    }
  }
  throw new ApiError(401, 'Invalid or expired token');
}

export async function evaluateAccessRequest(req, { expectedRole }) {
  const token = readAccessToken(req, expectedRole);
  if (!token) {
    throw new ApiError(401, 'Authentication required');
  }
  const payload = verifyAccessJwt(token);
  if (payload?.type && payload.type !== 'access') {
    throw new ApiError(401, 'Invalid token type');
  }
  if (!payload?.id || !payload?.sid) {
    throw new ApiError(401, 'Invalid token payload');
  }
  if (!Number.isFinite(Number(payload.tokenVersion))) {
    throw new ApiError(401, 'Invalid token version');
  }
  if (expectedRole === 'admin' && payload.role !== 'admin' && payload.role !== 'super_admin') {
    throw new ApiError(403, 'Admin access required');
  }
  if (expectedRole === 'student' && payload.role !== 'student') {
    throw new ApiError(403, 'Student access required');
  }

  const [rows] = await mysqlPool.query(
    `SELECT s.id, s.token_version_snapshot, u.token_version
     FROM auth_sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.id = ? AND s.user_id = ? AND s.revoked_at IS NULL AND s.expires_at > NOW()
     LIMIT 1`,
    [payload.sid, payload.id]
  );
  const session = rows[0];
  if (!session) {
    throw new ApiError(401, 'Session expired. Please sign in again.');
  }
  const tokenVersion = Number(payload.tokenVersion);
  if (tokenVersion !== Number(session.token_version_snapshot) || tokenVersion !== Number(session.token_version)) {
    throw new ApiError(401, 'Session expired. Please sign in again.');
  }
  return payload;
}

