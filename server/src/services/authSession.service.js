import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { mysqlPool } from '../config/mysql.js';
import { env } from '../config/env.js';

function hashRefreshToken(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

/**
 * Creates auth_sessions row and returns access + refresh JWTs (refresh hashed in DB only).
 * @param {object} params
 * @param {number} params.userId
 * @param {string} params.role - JWT role claim (student | admin | super_admin)
 * @param {string} params.roleSnapshot - Row role_snapshot (student | admin | super_admin)
 * @param {number} params.tokenVersion
 * @param {string} params.email
 * @param {string} params.fullName - Display name for access token `name` claim
 */
export async function createAuthSessionTokens({ userId, role, roleSnapshot, tokenVersion, email, fullName }) {
  const sessionId = crypto.randomUUID();
  const refreshJti = crypto.randomUUID();
  const tv = Number(tokenVersion || 0);

  const refreshToken = jwt.sign(
    {
      sub: userId,
      type: 'refresh',
      sid: sessionId,
      jti: refreshJti,
      tokenVersion: tv,
    },
    env.jwt.refreshSecret,
    {
      expiresIn: env.jwt.refreshExpiresIn,
      issuer: env.jwt.issuer,
      audience: env.jwt.audience,
      algorithm: 'HS256',
    }
  );

  const decodedRefresh = jwt.decode(refreshToken);
  const refreshExp = decodedRefresh?.exp;
  if (!refreshExp) {
    throw new Error('Refresh token missing exp claim');
  }

  const accessToken = jwt.sign(
    {
      sub: userId,
      id: userId,
      email,
      role,
      name: fullName,
      type: 'access',
      tokenVersion: tv,
      sid: sessionId,
    },
    env.jwt.accessSecret,
    {
      expiresIn: '15m',
      issuer: env.jwt.issuer,
      audience: env.jwt.audience,
      algorithm: 'HS256',
    }
  );

  const refreshTokenHash = hashRefreshToken(refreshToken);

  await mysqlPool.query(
    `INSERT INTO auth_sessions (id, user_id, role_snapshot, jti, refresh_token_hash, token_version_snapshot, created_at, last_used_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, FROM_UNIXTIME(?))`,
    [sessionId, userId, roleSnapshot, refreshJti, refreshTokenHash, tv, refreshExp]
  );

  return { accessToken, refreshToken };
}

export async function deleteAuthSessionsForUser(userId) {
  await mysqlPool.query(`DELETE FROM auth_sessions WHERE user_id = ?`, [userId]);
}
