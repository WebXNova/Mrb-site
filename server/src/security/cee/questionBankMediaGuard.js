/**
 * CEE grid guard for GET /api/uploads/question-bank/* — identity only.
 * Authorization (staff vs entitled student) is enforced in secureMedia.service.js.
 */

import jwt from 'jsonwebtoken';
import { mysqlPool } from '../../config/mysql.js';
import { env } from '../../config/env.js';
import { ApiError } from '../../utils/apiError.js';
import { UnauthorizedError } from '../../errors/entitlement/EntitlementErrors.js';
import { isQuestionBankStaffRole } from '../../utils/isQuestionBankStaffRole.js';
import {
  readMultiRealmAccessToken,
  assertRealmBearerAllowedInProduction,
} from '../../services/authDecisionEngine.js';

const ALLOWED_ROLES = new Set(['student', 'teacher', 'admin', 'super_admin']);

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
  throw new UnauthorizedError('Invalid or expired token.', { reason: 'invalid_session' });
}

/**
 * @type {import('express').RequestHandler}
 */
export async function questionBankMediaGuard(req, res, next) {
  try {
    const { token, source } = readMultiRealmAccessToken(req);
    if (!token) {
      throw new UnauthorizedError('Authentication required.', { reason: 'missing_token' });
    }

    const payload = verifyAccessJwt(token);
    if (payload?.type && payload.type !== 'access') {
      throw new UnauthorizedError('Invalid token type.', { reason: 'invalid_token_type' });
    }
    if (!payload?.id || !payload?.sid) {
      throw new UnauthorizedError('Invalid token payload.', { reason: 'invalid_token_payload' });
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
      throw new UnauthorizedError('Session expired. Please sign in again.', { reason: 'session_expired' });
    }

    const tokenVersion = Number(payload.tokenVersion);
    if (
      tokenVersion !== Number(session.token_version_snapshot) ||
      tokenVersion !== Number(session.token_version)
    ) {
      throw new UnauthorizedError('Session expired. Please sign in again.', { reason: 'token_version_mismatch' });
    }

    if (session.status !== 'active') {
      const isInactiveTeacher =
        String(session.role || '') === 'teacher' && session.status === 'inactive';
      throw new ApiError(
        403,
        isInactiveTeacher ? 'Teacher account is inactive' : 'Account is suspended'
      );
    }

    const role = String(session.role || payload.role || '');
    assertRealmBearerAllowedInProduction(req, source, role);
    if (!ALLOWED_ROLES.has(role)) {
      throw new ApiError(403, 'You do not have permission to access this file.');
    }

    const riskLevel = String(session.risk_level || 'normal');
    const score = { normal: 0, elevated: 1, critical: 2 };
    const maxRisk = isQuestionBankStaffRole(role) ? 'elevated' : 'elevated';
    if ((score[riskLevel] ?? 2) > (score[maxRisk] ?? 1)) {
      throw new ApiError(403, 'Account risk level requires additional verification');
    }

    req.user = { ...payload, role };
    return next();
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    return next(error);
  }
}
