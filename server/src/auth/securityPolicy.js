import { mysqlPool } from '../config/mysql.js';
import { ApiError } from '../utils/apiError.js';
import { requireAdmin, requireStudent } from '../middleware/auth.js';
import { requireStudentVerified } from '../middleware/requireStudentVerified.js';
import { requireCsrf } from '../middleware/csrf.js';
import { env } from '../config/env.js';
import { startAuthTrace } from '../utils/authProfiling.js';

function runMiddleware(middleware, req, res) {
  return new Promise((resolve, reject) => {
    middleware(req, res, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

export async function requireAuth(req, res, role = 'student') {
  if (role === 'admin') {
    await runMiddleware(requireAdmin, req, res);
    return;
  }
  await runMiddleware(requireStudent, req, res);
}

export async function requireRole(req, res, role) {
  await requireAuth(req, res, role);
}

export async function requireVerified(req, res) {
  await runMiddleware(requireStudentVerified, req, res);
}

export async function requireRiskLevel(req, _res, maxAllowedRisk = 'elevated') {
  const trace = startAuthTrace(`requireRiskLevel:${maxAllowedRisk}`, req);
  if (!req.user?.id) throw new ApiError(401, 'Authentication required');
  const [rows] = await mysqlPool.query(`SELECT risk_level FROM users WHERE id = ? LIMIT 1`, [req.user.id]);
  trace.step('mysql.riskLevelLookup');
  const riskLevel = String(rows[0]?.risk_level || 'normal');
  const score = { normal: 0, elevated: 1, critical: 2 };
  if ((score[riskLevel] ?? 2) > (score[maxAllowedRisk] ?? 1)) {
    trace.end('forbidden', { riskLevel });
    throw new ApiError(403, 'Account risk level requires additional verification');
  }
  trace.end('ok', { riskLevel });
}

export async function requireFreshSession(req, _res) {
  if (!req.user?.iat) return;
  const maxAgeSeconds = Number(process.env.FRESH_SESSION_MAX_AGE_SECONDS || 15 * 60);
  const ageSeconds = Math.max(0, Math.floor(Date.now() / 1000) - Number(req.user.iat));
  if (ageSeconds > maxAgeSeconds) {
    throw new ApiError(401, 'Recent sign-in required');
  }
}

export async function requireStepUpVerification(req, _res) {
  const expected = String(env.security.authChallengeKey || '');
  if (!expected) {
    throw new ApiError(503, 'Step-up verification is not configured');
  }
  const provided = String(req.get('x-auth-challenge') || '');
  if (!provided || provided !== expected) {
    throw new ApiError(403, 'Step-up verification required');
  }
}

export function enforcePolicy(policy = {}) {
  const {
    auth = null,
    verified = false,
    csrf = false,
    maxRisk = null,
    freshSession = false,
    stepUp = false,
  } = policy;
  return async (req, res, next) => {
    const trace = startAuthTrace('enforcePolicy', req);
    try {
      if (auth) {
        await requireRole(req, res, auth);
        trace.step(`requireRole:${auth}`);
      }
      if (verified) {
        await requireVerified(req, res);
        trace.step('requireVerified');
      }
      if (csrf) {
        await runMiddleware(requireCsrf, req, res);
        trace.step('requireCsrf');
      }
      if (maxRisk) {
        await requireRiskLevel(req, res, maxRisk);
        trace.step(`requireRiskLevel:${maxRisk}`);
      }
      if (freshSession) {
        await requireFreshSession(req, res);
        trace.step('requireFreshSession');
      }
      if (stepUp) {
        await requireStepUpVerification(req, res);
        trace.step('requireStepUpVerification');
      }
      trace.end('ok', { path: req.path, auth, maxRisk: maxRisk || null });
      return next();
    } catch (error) {
      trace.end('error', { path: req.path, message: error instanceof Error ? error.message : String(error) });
      return next(error);
    }
  };
}

