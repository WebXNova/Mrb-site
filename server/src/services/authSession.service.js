import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { mysqlPool } from '../config/mysql.js';
import { env } from '../config/env.js';
import { ApiError } from '../utils/apiError.js';

function hashRefreshToken(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function signRefreshToken({ userId, sessionId, refreshJti, tokenVersion }) {
  return jwt.sign(
    {
      sub: userId,
      type: 'refresh',
      sid: sessionId,
      jti: refreshJti,
      tokenVersion,
    },
    env.jwt.refreshSecret,
    {
      expiresIn: env.jwt.refreshExpiresIn,
      issuer: env.jwt.issuer,
      audience: env.jwt.audience,
      algorithm: 'HS256',
    }
  );
}

function signAccessToken({ userId, email, role, fullName, tokenVersion, sessionId }) {
  return jwt.sign(
    {
      sub: userId,
      id: userId,
      email,
      role,
      name: fullName,
      type: 'access',
      tokenVersion,
      sid: sessionId,
    },
    env.jwt.accessSecret,
    {
      expiresIn: env.jwt.accessExpiresIn,
      issuer: env.jwt.issuer,
      audience: env.jwt.audience,
      algorithm: 'HS256',
    }
  );
}

function decodeRequiredExp(token, tokenType) {
  const decoded = jwt.decode(token);
  const exp = decoded?.exp;
  if (!exp) {
    throw new Error(`${tokenType} token missing exp claim`);
  }
  return exp;
}

/**
 * Creates auth_sessions row and returns access + refresh JWTs (refresh hashed in DB only).
 * @param {import('mysql2/promise').PoolConnection | null} connection - When set, INSERT runs on this connection (same transaction as revoke).
 */
export async function createAuthSessionTokens({ userId, role, roleSnapshot, tokenVersion, email, fullName }, connection = null) {
  const sessionId = crypto.randomUUID();
  const refreshJti = crypto.randomUUID();
  const tv = Number(tokenVersion || 0);

  const refreshToken = signRefreshToken({ userId, sessionId, refreshJti, tokenVersion: tv });
  const refreshExp = decodeRequiredExp(refreshToken, 'Refresh');
  const accessToken = signAccessToken({ userId, email, role, fullName, tokenVersion: tv, sessionId });

  const refreshTokenHash = hashRefreshToken(refreshToken);

  const run = connection ? connection.query.bind(connection) : mysqlPool.query.bind(mysqlPool);
  await run(
    `INSERT INTO auth_sessions (id, user_id, role_snapshot, jti, refresh_token_hash, token_version_snapshot, created_at, last_used_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, FROM_UNIXTIME(?))`,
    [sessionId, userId, roleSnapshot, refreshJti, refreshTokenHash, tv, refreshExp]
  );

  return { accessToken, refreshToken };
}

/**
 * Revokes all sessions for a user (soft delete).
 * Used on login to enforce a single active session without removing rows.
 */
export async function deleteAuthSessionsForUser(userId, connection = null) {
  const run = connection ? connection.query.bind(connection) : mysqlPool.query.bind(mysqlPool);
  await run(`UPDATE auth_sessions SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP) WHERE user_id = ?`, [userId]);
}

/**
 * Logout: remove session row and bump users.token_version so all access JWTs for this user fail immediately.
 */
export async function revokeAuthSessionByRefreshToken(refreshToken) {
  if (!refreshToken) return;
  const tokenHash = hashRefreshToken(refreshToken);
  const connection = await mysqlPool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(
      `SELECT id, user_id FROM auth_sessions WHERE refresh_token_hash = ? LIMIT 1 FOR UPDATE`,
      [tokenHash]
    );
    const row = rows[0];
    if (row) {
      await connection.query(`DELETE FROM auth_sessions WHERE id = ?`, [row.id]);
      await connection.query(`UPDATE users SET token_version = token_version + 1 WHERE id = ?`, [row.user_id]);
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/** Resolve cookie + DB state for refresh routing (revoked sessions → null). */
export async function refreshContextFromToken(token, cookieName) {
  try {
    const payload = verifyRefreshToken(token);
    const [rows] = await mysqlPool.query(
      `SELECT id, revoked_at, role_snapshot FROM auth_sessions WHERE id = ? LIMIT 1`,
      [payload.sid]
    );
    const row = rows[0];
    if (!row || row.revoked_at) return null;
    const role = row.role_snapshot === 'student' ? 'student' : 'admin';
    return { token, cookieName, role };
  } catch {
    return null;
  }
}

/**
 * When both role cookies exist, pick the one whose session row is still active (revoked_at IS NULL).
 * If both are active (should not happen after login clears opposite cookie), require x-auth-role.
 */
export async function pickActiveRefreshContext(adminToken, studentToken) {
  if (!adminToken && !studentToken) return null;

  if (adminToken && !studentToken) {
    const ctx = await refreshContextFromToken(adminToken, 'admin_refresh_token');
    if (!ctx) throw new ApiError(401, 'Invalid or expired refresh token');
    return ctx;
  }
  if (studentToken && !adminToken) {
    const ctx = await refreshContextFromToken(studentToken, 'student_refresh_token');
    if (!ctx) throw new ApiError(401, 'Invalid or expired refresh token');
    return ctx;
  }

  const adminPick = await refreshContextFromToken(adminToken, 'admin_refresh_token');
  const studentPick = await refreshContextFromToken(studentToken, 'student_refresh_token');
  if (adminPick && !studentPick) return adminPick;
  if (studentPick && !adminPick) return studentPick;
  if (adminPick && studentPick) {
    throw new ApiError(400, 'Ambiguous refresh context. Provide x-auth-role header.');
  }
  throw new ApiError(401, 'Refresh token required');
}

export function verifyRefreshToken(refreshToken) {
  try {
    const payload = jwt.verify(refreshToken, env.jwt.refreshSecret, {
      algorithms: ['HS256'],
      issuer: env.jwt.issuer,
      audience: env.jwt.audience,
    });
    if (!payload?.sid || !payload?.jti || !payload?.sub) {
      throw new ApiError(401, 'Invalid refresh token payload');
    }
    if (payload.type !== 'refresh') {
      throw new ApiError(401, 'Invalid token type');
    }
    return payload;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(401, 'Invalid or expired refresh token');
  }
}

/**
 * Strict refresh rotation: verify JWT → load session FOR UPDATE → validate → update same row only.
 * Stale/wrong refresh: 401 only (no user-wide revoke).
 */
export async function rotateAuthSessionByRefreshToken(refreshToken) {
  // 1. Verify JWT (refresh)
  const payload = verifyRefreshToken(refreshToken);
  const sid = String(payload.sid);
  const jtiFromJwt = String(payload.jti);
  const userIdFromJwt = Number(payload.sub);
  const tokenVersionFromJwt = Number(payload.tokenVersion ?? 0);
  const providedHash = hashRefreshToken(refreshToken);

  const connection = await mysqlPool.getConnection();
  let transactionCommitted = false;
  try {
    await connection.beginTransaction();

    // 3. Load session by sid (FOR UPDATE)
    const [rows] = await connection.query(
      `SELECT
         s.id,
         s.user_id,
         s.role_snapshot,
         s.jti,
         s.refresh_token_hash,
         s.token_version_snapshot,
         s.expires_at,
         s.revoked_at,
         u.id AS user_id_ref,
         u.email,
         u.username,
         u.full_name,
         u.role AS user_role,
         u.status,
         u.token_version
       FROM auth_sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.id = ?
       LIMIT 1
       FOR UPDATE`,
      [sid]
    );
    const session = rows[0];

    // 4. Validate session exists
    if (!session) {
      throw new ApiError(401, 'Invalid refresh token');
    }
    // revoked_at must be NULL
    if (session.revoked_at) {
      throw new ApiError(401, 'Session superseded by a new sign-in. Please sign in again.');
    }
    // expires_at > NOW()
    if (new Date(session.expires_at).getTime() <= Date.now()) {
      throw new ApiError(401, 'Refresh token expired. Please sign in again.');
    }
    // hash + jti + user binding (do not mass-revoke on mismatch — avoids race / double-refresh logout)
    const identityMismatch =
      Number(session.user_id) !== userIdFromJwt ||
      Number(session.token_version_snapshot ?? 0) !== tokenVersionFromJwt;
    const tokenMismatch = session.jti !== jtiFromJwt || session.refresh_token_hash !== providedHash;
    if (identityMismatch || tokenMismatch) {
      throw new ApiError(401, 'Invalid refresh token');
    }

    if (session.status !== 'active') {
      await connection.query(
        `UPDATE auth_sessions SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP) WHERE id = ?`,
        [session.id]
      );
      await connection.commit();
      transactionCommitted = true;
      throw new ApiError(403, 'Account is suspended');
    }

    // 5. Only after validation: new refresh (new jti), same sid, UPDATE same row
    const stableSessionId = sid;
    const rotatedJti = crypto.randomUUID();
    const rotatedRefreshToken = signRefreshToken({
      userId: session.user_id,
      sessionId: stableSessionId,
      refreshJti: rotatedJti,
      tokenVersion: Number(session.token_version || 0),
    });
    const rotatedExp = decodeRequiredExp(rotatedRefreshToken, 'Refresh');
    const rotatedHash = hashRefreshToken(rotatedRefreshToken);
    await connection.query(
      `UPDATE auth_sessions
       SET jti = ?,
           refresh_token_hash = ?,
           token_version_snapshot = ?,
           expires_at = FROM_UNIXTIME(?),
           last_used_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [rotatedJti, rotatedHash, Number(session.token_version || 0), rotatedExp, stableSessionId]
    );

    const role = session.user_role;
    const accessToken = signAccessToken({
      userId: session.user_id,
      email: session.email,
      role,
      fullName: session.full_name,
      tokenVersion: Number(session.token_version || 0),
      sessionId: stableSessionId,
    });

    await connection.commit();
    transactionCommitted = true;

    const baseUser = {
      id: session.user_id,
      email: session.email,
      username: session.username,
      fullName: session.full_name,
      role,
    };

    if (role === 'student') {
      try {
        const [mrbRows] = await mysqlPool.query(
          `SELECT mrb_enrollment_verified_at FROM users WHERE id = ? LIMIT 1`,
          [session.user_id]
        );
        return {
          accessToken,
          refreshToken: rotatedRefreshToken,
          role,
          user: {
            ...baseUser,
            mrbEnrollmentVerified: Boolean(mrbRows[0]?.mrb_enrollment_verified_at),
          },
        };
      } catch (error) {
        if (error?.code === 'ER_BAD_FIELD_ERROR') {
          return { accessToken, refreshToken: rotatedRefreshToken, role, user: { ...baseUser, mrbEnrollmentVerified: false } };
        }
        throw error;
      }
    }

    return {
      accessToken,
      refreshToken: rotatedRefreshToken,
      role,
      user: baseUser,
    };
  } catch (error) {
    if (!transactionCommitted) {
      try {
        await connection.rollback();
      } catch {
        // Ignore rollback failures.
      }
    }
    throw error;
  } finally {
    connection.release();
  }
}
