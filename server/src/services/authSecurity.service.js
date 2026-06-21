/**
 * H-06/H-07 — Authentication security events and in-process metrics.
 */

import { StructuredLogger } from '../utils/requestId.js';
import { logActivity } from './activityLog.service.js';
import { sanitizePath } from '../utils/logSanitizer.js';

const logger = new StructuredLogger({ service: 'authSecurity' });

export function isProductionAuthMode() {
  return (process.env.NODE_ENV || 'development') === 'production';
}

const counters = {
  bearerRejected: 0,
  refreshFingerprintMismatch: 0,
  refreshRejected: 0,
  refreshReplayHighRisk: 0,
  suspiciousActivity: 0,
};

function bump(field) {
  counters[field] += 1;
}

export function getAuthSecurityMetrics() {
  return { ...counters };
}

export function resetAuthSecurityMetricsForTests() {
  counters.bearerRejected = 0;
  counters.refreshFingerprintMismatch = 0;
  counters.refreshRejected = 0;
  counters.refreshReplayHighRisk = 0;
  counters.suspiciousActivity = 0;
}

/**
 * @param {import('express').Request} req
 * @param {'student'|'teacher'|'admin'} role
 */
export async function logBearerTokenRejected(req, role) {
  bump('bearerRejected');
  bump('suspiciousActivity');

  const payload = {
    event: 'BEARER_REJECTED_IN_PRODUCTION',
    role,
    path: sanitizePath(req.originalUrl || req.path),
    timestamp: new Date().toISOString(),
    metrics: getAuthSecurityMetrics(),
  };

  logger.warn('Bearer token rejected in production', payload);
  await logActivity({
    userId: req.user?.id ?? null,
    role: role === 'student' ? 'student' : role === 'teacher' ? 'teacher' : 'admin',
    action: 'auth.bearer_rejected',
    entityType: 'auth',
    metadata: payload,
  });
}

/**
 * @param {{
 *   userId: number,
 *   sessionId: string,
 *   role?: string,
 *   reason: string,
 *   clientIp?: string|null,
 *   userAgent?: string|null,
 *   riskLevel?: string,
 * }} detail
 */
export async function logRefreshFingerprintMismatch(detail) {
  bump('refreshFingerprintMismatch');
  bump('suspiciousActivity');

  const payload = {
    event: 'REFRESH_FINGERPRINT_MISMATCH',
    userId: detail.userId,
    sessionId: detail.sessionId,
    reason: detail.reason,
    riskLevel: detail.riskLevel ?? 'high',
    timestamp: new Date().toISOString(),
    metrics: getAuthSecurityMetrics(),
  };

  logger.warn('Refresh fingerprint mismatch — re-authentication required', payload);
  await logActivity({
    userId: detail.userId,
    role: detail.role === 'student' ? 'student' : detail.role === 'teacher' ? 'teacher' : 'admin',
    action: 'auth.refresh_fingerprint_mismatch',
    entityType: 'auth',
    metadata: payload,
  });
}

/**
 * @param {{
 *   userId?: number|null,
 *   sessionId?: string|null,
 *   reason: string,
 *   role?: string,
 * }} detail
 */
export async function logRefreshRejected(detail) {
  bump('refreshRejected');

  const payload = {
    event: 'REFRESH_REJECTED',
    userId: detail.userId ?? null,
    sessionId: detail.sessionId ?? null,
    reason: detail.reason,
    timestamp: new Date().toISOString(),
    metrics: getAuthSecurityMetrics(),
  };

  logger.warn('Refresh token rejected', payload);
  await logActivity({
    userId: detail.userId ?? null,
    role: detail.role === 'student' ? 'student' : detail.role === 'teacher' ? 'teacher' : 'admin',
    action: 'auth.refresh_rejected',
    entityType: 'auth',
    metadata: payload,
  });
}

/**
 * @param {{
 *   userId: number,
 *   sessionId: string,
 *   role?: string,
 *   reason: string,
 *   withinGrace?: boolean,
 *   ipMatch?: boolean,
 *   uaMatch?: boolean,
 *   graceMs?: number,
 * }} detail
 */
export async function logRefreshReplayHighRisk(detail) {
  bump('refreshReplayHighRisk');
  bump('suspiciousActivity');

  const payload = {
    event: 'REFRESH_REPLAY_HIGH_RISK',
    userId: detail.userId,
    sessionId: detail.sessionId,
    reason: detail.reason,
    withinGrace: detail.withinGrace ?? false,
    ipMatch: detail.ipMatch ?? false,
    uaMatch: detail.uaMatch ?? false,
    graceMs: detail.graceMs ?? null,
    timestamp: new Date().toISOString(),
    metrics: getAuthSecurityMetrics(),
  };

  logger.warn('Refresh replay classified as high risk — session revoked', payload);
  await logActivity({
    userId: detail.userId,
    role: detail.role === 'student' ? 'student' : detail.role === 'teacher' ? 'teacher' : 'admin',
    action: 'auth.refresh_replay_high_risk',
    entityType: 'auth',
    metadata: payload,
  });
}

/**
 * @param {{
 *   userId: number,
 *   sessionId: string,
 *   role?: string,
 *   riskLevel: string,
 * }} detail
 */
export async function logRefreshFingerprintSuspicious(detail) {
  bump('suspiciousActivity');

  await logActivity({
    userId: detail.userId,
    role: detail.role === 'student' ? 'student' : detail.role === 'teacher' ? 'teacher' : 'admin',
    action: 'auth.refresh_fingerprint_suspicious',
    entityType: 'auth',
    metadata: {
      sessionId: detail.sessionId,
      riskLevel: detail.riskLevel,
      timestamp: new Date().toISOString(),
    },
  });
}

/**
 * OAuth account lifecycle audit (link, register, login, conflict).
 * Never log raw provider tokens or provider_account_id in full — use a short hash prefix.
 * @param {{
 *   userId?: number|null,
 *   role?: string,
 *   action: 'auth.oauth.login'|'auth.oauth.register'|'auth.oauth.linked'|'auth.oauth.conflict',
 *   provider: string,
 *   providerAccountId?: string,
 *   clientIp?: string|null,
 *   userAgent?: string|null,
 *   metadata?: Record<string, unknown>,
 * }} detail
 */
export async function logOAuthAccountEvent(detail) {
  const providerAccountPrefix = detail.providerAccountId
    ? String(detail.providerAccountId).slice(0, 8)
    : null;

  const payload = {
    provider: detail.provider,
    providerAccountPrefix,
    ipAddress: detail.clientIp ?? null,
    userAgent: detail.userAgent ?? null,
    timestamp: new Date().toISOString(),
    ...(detail.metadata || {}),
  };

  if (detail.action === 'auth.oauth.conflict') {
    bump('suspiciousActivity');
    logger.warn('OAuth account linking conflict', payload);
  }

  await logActivity({
    userId: detail.userId ?? null,
    role: detail.role === 'student' ? 'student' : detail.role === 'teacher' ? 'teacher' : 'admin',
    action: detail.action,
    entityType: 'auth',
    metadata: payload,
  });
}
