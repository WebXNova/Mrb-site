import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { mysqlPool } from '../config/mysql.js';
import { env } from '../config/env.js';
import { ApiError } from '../utils/apiError.js';
import { logActivity } from '../services/activityLog.service.js';
import {
  logRefreshFingerprintMismatch,
  logRefreshFingerprintSuspicious,
  logRefreshRejected,
} from './authSecurity.service.js';
import {
  ReplayRiskLevel,
  buildLowRiskReplayResponse,
  classifyRefreshReplayRisk,
  getReplayGraceMs,
  revokeSessionForHighRiskReplay,
} from './refreshReplayRisk.service.js';
import { getRedisClient } from '../config/redis.js';
import { startAuthTrace } from '../utils/authProfiling.js';

const refreshBuckets = new Map();
const mediumRiskAllowance = new Map();
const REFRESH_BUCKET_WINDOW_MS = 30_000;
const REFRESH_BLOCK_WINDOW_MS = 60_000;
const MEDIUM_RISK_ALLOWANCE_WINDOW_MS = 24 * 60 * 60 * 1000;

function hashRefreshToken(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function hashValue(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function networkFingerprint(ipAddress) {
  const raw = String(ipAddress || '').trim();
  if (!raw) return '';
  const normalized = raw.includes(':') ? raw.split(':').slice(0, 4).join(':') : raw.split('.').slice(0, 3).join('.');
  return normalized;
}

function nowMs() {
  return Date.now();
}

setInterval(() => {
  const now = nowMs();
  for (const [sid, entry] of refreshBuckets.entries()) {
    if (now - entry.startedAt > REFRESH_BUCKET_WINDOW_MS * 2 && entry.blockedUntil <= now - REFRESH_BLOCK_WINDOW_MS) {
      refreshBuckets.delete(sid);
    }
  }
  for (const [sid, ts] of mediumRiskAllowance.entries()) {
    if (now - ts > MEDIUM_RISK_ALLOWANCE_WINDOW_MS) {
      mediumRiskAllowance.delete(sid);
    }
  }
}, 60_000).unref();

async function assertRefreshSessionRateLimit(sessionId) {
  const redis = getRedisClient();
  const countKey = `auth:refresh:count:${sessionId}`;
  const blockKey = `auth:refresh:block:${sessionId}`;
  if (redis) {
    const blocked = await redis.ttl(blockKey);
    if (blocked > 0) {
      throw new ApiError(429, 'Too many refresh attempts. Please try again shortly.');
    }
    const count = await redis.incr(countKey);
    if (count === 1) await redis.expire(countKey, 30);
    if (count > 20) {
      await redis.set(blockKey, '1', { EX: 60 });
      throw new ApiError(429, 'Too many refresh attempts. Please try again shortly.');
    }
    return;
  }
  const entry = refreshBuckets.get(sessionId) || { count: 0, startedAt: nowMs(), blockedUntil: 0 };
  if (entry.blockedUntil > nowMs()) {
    throw new ApiError(429, 'Too many refresh attempts. Please try again shortly.');
  }
  if (nowMs() - entry.startedAt > 30_000) {
    entry.count = 0;
    entry.startedAt = nowMs();
  }
  entry.count += 1;
  if (entry.count > 20) {
    entry.blockedUntil = nowMs() + 60_000;
  }
  refreshBuckets.set(sessionId, entry);
  if (entry.blockedUntil > nowMs()) {
    throw new ApiError(429, 'Too many refresh attempts. Please try again shortly.');
  }
}

async function classifyFingerprintRisk({ sessionId, lastIpHash, lastUaHash, clientIp, userAgent, lastUsedAt }) {
  const incomingIpHash = clientIp ? hashValue(networkFingerprint(clientIp)) : null;
  const incomingUaHash = userAgent ? hashValue(userAgent) : null;
  if (!lastIpHash && !lastUaHash) {
    return { level: 'low', incomingIpHash, incomingUaHash };
  }
  const ipMatch = !lastIpHash || !incomingIpHash || lastIpHash === incomingIpHash;
  const uaMatch = !lastUaHash || !incomingUaHash || lastUaHash === incomingUaHash;
  const recentMs = lastUsedAt ? nowMs() - new Date(lastUsedAt).getTime() : Number.POSITIVE_INFINITY;
  if (ipMatch && uaMatch) {
    return { level: 'low', incomingIpHash, incomingUaHash };
  }
  if (uaMatch && !ipMatch && recentMs <= 15 * 60 * 1000) {
    return { level: 'low', incomingIpHash, incomingUaHash };
  }
  if ((uaMatch && !ipMatch) || (!uaMatch && ipMatch)) {
    const redis = getRedisClient();
    const key = `auth:refresh:medium-risk:${sessionId}`;
    if (redis) {
      const alreadyUsed = await redis.get(key);
      if (!alreadyUsed) {
        await redis.set(key, '1', { EX: 24 * 60 * 60 });
        return { level: 'medium', incomingIpHash, incomingUaHash };
      }
      return { level: 'high', incomingIpHash, incomingUaHash };
    }
    const used = mediumRiskAllowance.get(sessionId);
    if (!used) {
      mediumRiskAllowance.set(sessionId, nowMs());
      return { level: 'medium', incomingIpHash, incomingUaHash };
    }
    return { level: 'high', incomingIpHash, incomingUaHash };
  }
  return { level: 'high', incomingIpHash, incomingUaHash };
}

export { classifyFingerprintRisk };

async function markAccountAtRisk(connection, userId) {
  try {
    await connection.query(`UPDATE users SET risk_level = 'critical' WHERE id = ?`, [userId]);
  } catch (error) {
    if (error?.code !== 'ER_BAD_FIELD_ERROR') throw error;
  }
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
export async function createAuthSessionTokens(
  { userId, role, roleSnapshot, tokenVersion, email, fullName, clientIp = null, userAgent = null },
  connection = null
) {
  const sessionId = crypto.randomUUID();
  const refreshJti = crypto.randomUUID();
  const tv = Number(tokenVersion || 0);

  const refreshToken = signRefreshToken({ userId, sessionId, refreshJti, tokenVersion: tv });
  const refreshExp = decodeRequiredExp(refreshToken, 'Refresh');
  const accessToken = signAccessToken({ userId, email, role, fullName, tokenVersion: tv, sessionId });

  const refreshTokenHash = hashRefreshToken(refreshToken);

  const run = connection ? connection.query.bind(connection) : mysqlPool.query.bind(mysqlPool);
  const clientIpHash = clientIp ? hashValue(networkFingerprint(clientIp)) : null;
  const userAgentFingerprint = userAgent ? hashValue(userAgent) : null;
  await run(
    `INSERT INTO auth_sessions (
        id, user_id, role_snapshot, jti, refresh_token_hash, previous_refresh_hash, token_version_snapshot,
        created_at, last_used_at, expires_at, last_ip_hash, ua_fingerprint
      )
     VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, FROM_UNIXTIME(?), ?, ?)`,
    [sessionId, userId, roleSnapshot, refreshJti, refreshTokenHash, null, tv, refreshExp, clientIpHash, userAgentFingerprint]
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

export async function revokeAllAuthSessionsForUser(userId) {
  if (!userId) return;
  const connection = await mysqlPool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query(`UPDATE auth_sessions SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP) WHERE user_id = ?`, [userId]);
    await connection.query(`UPDATE users SET token_version = token_version + 1 WHERE id = ?`, [userId]);
    await connection.commit();
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      // ignore rollback failures
    }
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * List auth sessions belonging to a single user (for profile / security UI).
 * @param {number} userId
 */
export async function listAuthSessionsForUser(userId) {
  const uid = Number(userId);
  if (!Number.isInteger(uid) || uid <= 0) return [];

  const [rows] = await mysqlPool.query(
    `SELECT id, role_snapshot, created_at, last_used_at, expires_at, revoked_at
     FROM auth_sessions
     WHERE user_id = ?
     ORDER BY COALESCE(last_used_at, created_at) DESC`,
    [uid]
  );

  const now = Date.now();
  return rows.map((row) => {
    const revoked = row.revoked_at != null;
    const expired = new Date(row.expires_at).getTime() <= now;
    let status = 'active';
    if (revoked) status = 'revoked';
    else if (expired) status = 'expired';

    return {
      id: row.id,
      role: row.role_snapshot,
      createdAt: row.created_at,
      lastUsedAt: row.last_used_at,
      expiresAt: row.expires_at,
      revokedAt: row.revoked_at,
      status,
    };
  });
}

/** Resolve cookie + DB state for refresh routing (revoked sessions → null). */
export async function refreshContextFromToken(token, cookieName, req = null) {
  const trace = startAuthTrace(`refreshContextFromToken:${cookieName}`, req);
  try {
    const payload = verifyRefreshToken(token);
    trace.step('verifyRefreshToken');
    const [rows] = await mysqlPool.query(
      `SELECT id, revoked_at, role_snapshot FROM auth_sessions WHERE id = ? LIMIT 1`,
      [payload.sid]
    );
    trace.step('mysql.sessionById', { rowCount: rows.length });
    const row = rows[0];
    if (!row || row.revoked_at) {
      trace.end('inactive');
      return null;
    }
    const snapshot = String(row.role_snapshot || '').toLowerCase();
    const role = snapshot === 'student' ? 'student' : snapshot === 'teacher' ? 'teacher' : 'admin';
    trace.end('ok', { role });
    return { token, cookieName, role };
  } catch {
    trace.end('error');
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
    const secrets = [env.jwt.refreshSecret, ...env.jwt.previousRefreshSecrets];
    let payload = null;
    for (const secret of secrets) {
      try {
        payload = jwt.verify(refreshToken, secret, {
          algorithms: ['HS256'],
          issuer: env.jwt.issuer,
          audience: env.jwt.audience,
        });
        break;
      } catch {
        // try next key
      }
    }
    if (!payload) {
      throw new ApiError(401, 'Invalid or expired refresh token');
    }
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
export async function rotateAuthSessionByRefreshToken(refreshToken, { clientIp = null, userAgent = null, req = null } = {}) {
  const trace = startAuthTrace('rotateAuthSessionByRefreshToken', req);
  const payload = verifyRefreshToken(refreshToken);
  trace.step('verifyRefreshToken');
  const sid = String(payload.sid);
  const jtiFromJwt = String(payload.jti || '');
  const providedHash = hashRefreshToken(refreshToken);

  const connection = await mysqlPool.getConnection();
  trace.step('mysql.getConnection');
  let transactionCommitted = false;
  try {
    await connection.beginTransaction();
    trace.step('mysql.beginTransaction');
    const [rows] = await connection.query(
      `SELECT
         s.id,
         s.user_id,
         s.role_snapshot,
         s.jti,
         s.refresh_token_hash,
         s.previous_refresh_hash,
         s.token_version_snapshot,
         s.expires_at,
         s.revoked_at,
         s.last_ip_hash,
         s.ua_fingerprint,
         s.last_used_at,
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
    trace.step('mysql.loadSessionForUpdate', { rowCount: rows.length });
    const session = rows[0];

    if (!session) {
      throw new ApiError(401, 'Invalid refresh token');
    }
    await assertRefreshSessionRateLimit(session.id);
    trace.step('refreshRateLimit');
    if (session.revoked_at) {
      throw new ApiError(401, 'Session superseded by a new sign-in. Please sign in again.');
    }
    if (new Date(session.expires_at).getTime() <= Date.now()) {
      throw new ApiError(401, 'Refresh token expired. Please sign in again.');
    }
    const sidMismatch = Number(session.user_id) !== Number(payload.sub);
    if (sidMismatch) {
      throw new ApiError(401, 'Invalid refresh token');
    }
    const tokenVersion = Number(payload.tokenVersion);
    if (!Number.isFinite(tokenVersion)) {
      throw new ApiError(401, 'Invalid refresh token');
    }
    if (tokenVersion !== Number(session.token_version) || tokenVersion !== Number(session.token_version_snapshot)) {
      await connection.query(`UPDATE auth_sessions SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP) WHERE id = ?`, [session.id]);
      throw new ApiError(401, 'Session superseded by a new sign-in. Please sign in again.');
    }
    const tokenMismatch = session.jti !== jtiFromJwt || session.refresh_token_hash !== providedHash;
    if (tokenMismatch) {
      const confirmedReplay = session.previous_refresh_hash && session.previous_refresh_hash === providedHash;
      if (confirmedReplay) {
        const replayRisk = classifyRefreshReplayRisk({ session, clientIp, userAgent });
        if (replayRisk.level === ReplayRiskLevel.LOW) {
          const lowRiskResponse = await buildLowRiskReplayResponse(session, signAccessToken);
          await logActivity({
            userId: session.user_id,
            role: session.user_role === 'student' ? 'student' : session.user_role === 'teacher' ? 'teacher' : 'admin',
            action: 'auth.refresh_replay_grace',
            entityType: 'auth',
            metadata: {
              replayRisk: replayRisk.level,
              reason: replayRisk.reason,
              graceMs: getReplayGraceMs(),
            },
          });
          await connection.commit();
          transactionCommitted = true;
          trace.end('ok', { userId: session.user_id, role: lowRiskResponse.role, graceReplay: true });
          return lowRiskResponse;
        }

        await revokeSessionForHighRiskReplay(connection, session, replayRisk);
        await logActivity({
          userId: session.user_id,
          role: session.user_role === 'student' ? 'student' : session.user_role === 'teacher' ? 'teacher' : 'admin',
          action: 'auth.refresh_replay_confirmed',
          entityType: 'auth',
          metadata: {
            replayRisk: replayRisk.level,
            reason: replayRisk.reason,
            graceMs: getReplayGraceMs(),
            ipMatch: replayRisk.ipMatch,
            uaMatch: replayRisk.uaMatch,
          },
        });
        await logRefreshRejected({
          userId: session.user_id,
          sessionId: session.id,
          role: session.user_role,
          reason: 'refresh_replay_high_risk',
        });
        await connection.commit();
        transactionCommitted = true;
        throw new ApiError(401, 'Session requires re-authentication', {
          code: 'REFRESH_REPLAY_REJECTED',
          error_code: 'REFRESH_REPLAY_REJECTED',
        });
      } else {
        await logActivity({
          userId: session.user_id,
          role: session.user_role === 'student' ? 'student' : session.user_role === 'teacher' ? 'teacher' : 'admin',
          action: 'auth.refresh_mismatch',
          entityType: 'auth',
        });
        await logRefreshRejected({
          userId: session.user_id,
          sessionId: session.id,
          role: session.user_role,
          reason: 'refresh_token_mismatch',
        });
      }
      throw new ApiError(401, 'Invalid refresh token', {
        code: 'REFRESH_SUPERSEDED',
        error_code: 'REFRESH_SUPERSEDED',
      });
    }

    const fingerprintRisk = await classifyFingerprintRisk({
      sessionId: session.id,
      lastIpHash: session.last_ip_hash,
      lastUaHash: session.ua_fingerprint,
      clientIp,
      userAgent,
      lastUsedAt: session.last_used_at,
    });

    if (fingerprintRisk.level === 'high') {
      await connection.query(
        `UPDATE auth_sessions SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP) WHERE id = ?`,
        [session.id]
      );
      await connection.query(`UPDATE users SET token_version = token_version + 1 WHERE id = ?`, [session.user_id]);
      await logRefreshFingerprintMismatch({
        userId: session.user_id,
        sessionId: session.id,
        role: session.user_role,
        reason: 'fingerprint_mismatch',
        clientIp,
        userAgent,
        riskLevel: fingerprintRisk.level,
      });
      await connection.commit();
      transactionCommitted = true;
      throw new ApiError(401, 'Session requires re-authentication', {
        code: 'REFRESH_FINGERPRINT_MISMATCH',
        error_code: 'REFRESH_FINGERPRINT_MISMATCH',
      });
    }

    if (fingerprintRisk.level === 'medium') {
      await logRefreshFingerprintSuspicious({
        userId: session.user_id,
        sessionId: session.id,
        role: session.user_role,
        riskLevel: fingerprintRisk.level,
      });
    }

    if (String(session.status || '').toLowerCase() !== 'active') {
      await connection.query(
        `UPDATE auth_sessions SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP) WHERE id = ?`,
        [session.id]
      );
      await connection.commit();
      transactionCommitted = true;
      throw new ApiError(403, 'Account is suspended');
    }
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
    const nextIpHash = fingerprintRisk.incomingIpHash ?? session.last_ip_hash;
    const nextUaHash = fingerprintRisk.incomingUaHash ?? session.ua_fingerprint;
    await connection.query(
      `UPDATE auth_sessions
       SET jti = ?,
           previous_refresh_hash = refresh_token_hash,
           refresh_token_hash = ?,
           token_version_snapshot = ?,
           expires_at = FROM_UNIXTIME(?),
           last_used_at = CURRENT_TIMESTAMP,
           last_ip_hash = ?,
           ua_fingerprint = ?
       WHERE id = ?`,
      [rotatedJti, rotatedHash, Number(session.token_version || 0), rotatedExp, nextIpHash, nextUaHash, stableSessionId]
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
    trace.step('mysql.commit');

    const baseUser = {
      id: session.user_id,
      email: session.email,
      username: session.username,
      fullName: session.full_name,
      role,
    };

    if (role === 'student') {
      const [rows] = await mysqlPool.query(`SELECT is_verified FROM users WHERE id = ? LIMIT 1`, [session.user_id]);
      trace.step('mysql.studentIsVerified');
      trace.end('ok', { userId: session.user_id, role });
      return {
        accessToken,
        refreshToken: rotatedRefreshToken,
        role,
        user: {
          ...baseUser,
          isVerified: Boolean(rows[0]?.is_verified),
        },
      };
    }

    trace.end('ok', { userId: session.user_id, role });
    return {
      accessToken,
      refreshToken: rotatedRefreshToken,
      role,
      user: baseUser,
    };
  } catch (error) {
    trace.end('error', { message: error instanceof Error ? error.message : String(error) });
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
