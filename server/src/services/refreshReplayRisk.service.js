/**
 * Refresh-token replay risk classification.
 *
 * Distinguishes legitimate multi-tab races (low risk) from likely token theft (high risk).
 * Low risk: within grace window + same IP range + same browser fingerprint.
 * High risk: outside grace and/or environment mismatch → session revocation.
 */

import crypto from 'crypto';
import { mysqlPool } from '../config/mysql.js';
import { env } from '../config/env.js';
import { logRefreshReplayHighRisk } from './authSecurity.service.js';

export const ReplayRiskLevel = /** @type {const} */ ({
  LOW: 'low',
  HIGH: 'high',
});

const DEFAULT_REPLAY_GRACE_MS = 60_000;

function hashValue(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function networkFingerprint(ipAddress) {
  const raw = String(ipAddress || '').trim();
  if (!raw) return '';
  return raw.includes(':') ? raw.split(':').slice(0, 4).join(':') : raw.split('.').slice(0, 3).join('.');
}

export function getReplayGraceMs() {
  const configured = Number(env.security?.refreshReplayGraceMs);
  if (Number.isFinite(configured) && configured >= 30_000 && configured <= 60_000) {
    return configured;
  }
  return DEFAULT_REPLAY_GRACE_MS;
}

export function isWithinReplayGraceWindow(lastUsedAt) {
  if (!lastUsedAt) return false;
  const elapsed = Date.now() - new Date(lastUsedAt).getTime();
  return elapsed >= 0 && elapsed <= getReplayGraceMs();
}

/**
 * Strict environment match for replay decisions (stricter than routine refresh fingerprint checks).
 */
export function evaluateReplayEnvironment({ lastIpHash, lastUaHash, clientIp, userAgent }) {
  const incomingIpHash = clientIp ? hashValue(networkFingerprint(clientIp)) : null;
  const incomingUaHash = userAgent ? hashValue(userAgent) : null;

  const ipMatch = !lastIpHash || !incomingIpHash || lastIpHash === incomingIpHash;
  const uaMatch = !lastUaHash || !incomingUaHash || lastUaHash === incomingUaHash;
  const sameEnvironment = ipMatch && uaMatch;

  return {
    incomingIpHash,
    incomingUaHash,
    ipMatch,
    uaMatch,
    sameEnvironment,
  };
}

/**
 * @param {{
 *   session: { last_used_at?: Date|string|null, last_ip_hash?: string|null, ua_fingerprint?: string|null },
 *   clientIp?: string|null,
 *   userAgent?: string|null,
 * }} input
 */
export function classifyRefreshReplayRisk({ session, clientIp = null, userAgent = null }) {
  const withinGrace = isWithinReplayGraceWindow(session.last_used_at);
  const environment = evaluateReplayEnvironment({
    lastIpHash: session.last_ip_hash,
    lastUaHash: session.ua_fingerprint,
    clientIp,
    userAgent,
  });

  if (!withinGrace) {
    return {
      level: ReplayRiskLevel.HIGH,
      reason: 'outside_grace_window',
      withinGrace,
      ...environment,
    };
  }

  if (!environment.sameEnvironment) {
    return {
      level: ReplayRiskLevel.HIGH,
      reason: !environment.uaMatch ? 'browser_fingerprint_mismatch' : 'ip_range_mismatch',
      withinGrace,
      ...environment,
    };
  }

  return {
    level: ReplayRiskLevel.LOW,
    reason: 'tab_race',
    withinGrace,
    ...environment,
  };
}

export async function buildUserFromSession(session) {
  const role = session.user_role;
  const baseUser = {
    id: session.user_id,
    email: session.email,
    username: session.username,
    fullName: session.full_name,
    role,
  };

  if (role === 'student') {
    const [rows] = await mysqlPool.query(`SELECT is_verified FROM users WHERE id = ? LIMIT 1`, [session.user_id]);
    return {
      ...baseUser,
      isVerified: Boolean(rows[0]?.is_verified),
    };
  }

  return baseUser;
}

/**
 * Low-risk replay: re-issue access token without rotating refresh (browser already has winner cookie).
 * @param {object} session - DB session row joined with user fields
 * @param {(args: object) => string} signAccessToken
 */
export async function buildLowRiskReplayResponse(session, signAccessToken) {
  const role = session.user_role;
  const accessToken = signAccessToken({
    userId: session.user_id,
    email: session.email,
    role,
    fullName: session.full_name,
    tokenVersion: Number(session.token_version || 0),
    sessionId: session.id,
  });
  const user = await buildUserFromSession(session);

  return {
    accessToken,
    refreshToken: null,
    skipRefreshCookie: true,
    role,
    user,
    graceReplay: true,
    replayRisk: ReplayRiskLevel.LOW,
  };
}

/**
 * High-risk replay: revoke session and bump token_version to invalidate all access JWTs.
 */
export async function revokeSessionForHighRiskReplay(connection, session, risk) {
  await connection.query(`UPDATE auth_sessions SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP) WHERE id = ?`, [
    session.id,
  ]);
  await connection.query(`UPDATE users SET token_version = token_version + 1 WHERE id = ?`, [session.user_id]);

  await logRefreshReplayHighRisk({
    userId: session.user_id,
    sessionId: session.id,
    role: session.user_role,
    reason: risk.reason,
    withinGrace: risk.withinGrace,
    ipMatch: risk.ipMatch,
    uaMatch: risk.uaMatch,
    graceMs: getReplayGraceMs(),
  });
}
