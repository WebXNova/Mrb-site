import jwt from 'jsonwebtoken';
import { mysqlPool } from '../config/mysql.js';
import { env } from '../config/env.js';
import { ApiError } from '../utils/apiError.js';
import { logActivity } from '../services/activityLog.service.js';
import { isQuestionBankStaffRole } from '../utils/isQuestionBankStaffRole.js';
import { getClientIp } from '../utils/network.js';
import { sanitizePath } from '../utils/logSanitizer.js';

const LOG_PREFIX = '[question-bank-upload-auth]';

function parseBearer(authHeader) {
  return authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
}

function readAccessToken(req) {
  return (
    req.cookies?.admin_access_token ||
    req.cookies?.student_access_token ||
    parseBearer(req.headers.authorization) ||
    null
  );
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

async function logAuthorizationFailure(req, reason, metadata = {}) {
  try {
    await logActivity({
      userId: req.user?.id ?? null,
      role: req.user?.role ?? 'system',
      action: 'admin.question.upload.authorization_denied',
      entityType: 'question_bank_upload',
      metadata: {
        reason,
        path: sanitizePath(req.originalUrl),
        ipAddress: getClientIp(req),
        ...metadata,
      },
    });
  } catch {
    /* non-blocking */
  }
  console.warn(`${LOG_PREFIX} authorization denied`, {
    reason,
    path: req.originalUrl,
    userId: req.user?.id ?? null,
    role: req.user?.role ?? null,
  });
}

/**
 * Authenticated admin/super_admin/teacher only (supports admin or student access cookies).
 * Registered before the global admin-only stack for /questions/upload-image.
 *
 * @type {import('express').RequestHandler}
 */
export async function requireQuestionBankStaff(req, res, next) {
  try {
    const token = readAccessToken(req);
    if (!token) {
      await logAuthorizationFailure(req, 'missing_token');
      throw new ApiError(401, 'Authentication required');
    }

    const payload = verifyAccessJwt(token);
    if (payload?.type && payload.type !== 'access') {
      await logAuthorizationFailure(req, 'invalid_token_type');
      throw new ApiError(401, 'Invalid token type');
    }
    if (!payload?.id || !payload?.sid) {
      await logAuthorizationFailure(req, 'invalid_token_payload');
      throw new ApiError(401, 'Invalid token payload');
    }
    if (!Number.isFinite(Number(payload.tokenVersion))) {
      await logAuthorizationFailure(req, 'invalid_token_version');
      throw new ApiError(401, 'Invalid token version');
    }

    const [rows] = await mysqlPool.query(
      `SELECT s.id, s.token_version_snapshot, u.token_version, u.risk_level, u.role, u.status
       FROM auth_sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.id = ? AND s.user_id = ? AND s.revoked_at IS NULL AND s.expires_at > NOW()
       LIMIT 1`,
      [payload.sid, payload.id]
    );
    const session = rows[0];
    if (!session) {
      await logAuthorizationFailure(req, 'session_expired', { userId: payload.id });
      throw new ApiError(401, 'Session expired. Please sign in again.');
    }

    const tokenVersion = Number(payload.tokenVersion);
    if (
      tokenVersion !== Number(session.token_version_snapshot) ||
      tokenVersion !== Number(session.token_version)
    ) {
      await logAuthorizationFailure(req, 'token_version_mismatch', { userId: payload.id });
      throw new ApiError(401, 'Session expired. Please sign in again.');
    }

    if (session.status !== 'active') {
      await logAuthorizationFailure(req, 'account_suspended', {
        userId: payload.id,
        role: session.role,
      });
      throw new ApiError(403, 'Account is suspended');
    }

    const role = String(session.role || payload.role || '');
    if (!isQuestionBankStaffRole(role)) {
      await logAuthorizationFailure(req, 'role_denied', { userId: payload.id, role });
      throw new ApiError(403, 'Question bank image upload requires admin or teacher access');
    }

    const riskLevel = String(session.risk_level || 'normal');
    const score = { normal: 0, elevated: 1, critical: 2 };
    if ((score[riskLevel] ?? 2) > score.elevated) {
      await logAuthorizationFailure(req, 'risk_level_denied', { userId: payload.id, riskLevel });
      throw new ApiError(403, 'Account risk level requires additional verification');
    }

    req.user = { ...payload, role };
    return next();
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    await logAuthorizationFailure(req, 'unexpected_auth_error', {
      message: error instanceof Error ? error.message : String(error),
    });
    return next(new ApiError(401, 'Invalid or expired token'));
  }
}
