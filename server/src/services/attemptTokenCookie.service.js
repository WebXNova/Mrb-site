/**
 * HttpOnly attempt-token cookie — XSS cannot read this secret.
 *
 * Modes (env ATTEMPT_TOKEN_MODE):
 * - cookie  — HttpOnly cookie only; Bearer rejected; tokens omitted from JSON body
 * - dual    — cookie + JSON body (migration)
 * - bearer  — legacy Bearer header + JSON body only (no cookie)
 */

import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { ApiError } from '../utils/apiError.js';

export const ATTEMPT_TOKEN_COOKIE_NAME = 'test_attempt_token';

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

/**
 * @returns {'cookie' | 'dual' | 'bearer'}
 */
export function getAttemptTokenMode() {
  const raw = String(process.env.ATTEMPT_TOKEN_MODE || env.security.attemptTokenMode || '').trim().toLowerCase();
  if (raw === 'bearer' || raw === 'dual' || raw === 'cookie') return raw;
  return env.nodeEnv === 'production' ? 'cookie' : 'dual';
}

export function isAttemptCookieMode() {
  const mode = getAttemptTokenMode();
  return mode === 'cookie' || mode === 'dual';
}

export function isAttemptCookieOnlyMode() {
  return getAttemptTokenMode() === 'cookie';
}

function cookieMaxAgeMs(token) {
  try {
    const decoded = jwt.decode(token);
    if (decoded?.exp) {
      const ms = decoded.exp * 1000 - Date.now();
      if (ms > 0) return Math.ceil(ms);
    }
  } catch {
    /* fall through */
  }
  return SIX_HOURS_MS;
}

/**
 * @param {import('express').Response} res
 * @param {string} token
 */
export function setAttemptTokenCookie(res, token) {
  if (!token || !isAttemptCookieMode()) return;
  res.cookie(ATTEMPT_TOKEN_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: env.security.attemptCookieSameSite,
    secure: env.security.attemptCookieSecure,
    path: env.security.attemptCookiePath,
    maxAge: cookieMaxAgeMs(token),
  });
}

/**
 * @param {import('express').Response} res
 */
export function clearAttemptTokenCookie(res) {
  res.clearCookie(ATTEMPT_TOKEN_COOKIE_NAME, {
    httpOnly: true,
    sameSite: env.security.attemptCookieSameSite,
    secure: env.security.attemptCookieSecure,
    path: env.security.attemptCookiePath,
  });
}

/**
 * Fail closed when cookie-only mode receives Authorization Bearer (stolen token replay from another client).
 * @param {import('express').Request} req
 */
export function rejectAttemptBearerInCookieOnlyMode(req) {
  if (!isAttemptCookieOnlyMode()) return;
  if (parseBearer(req.headers.authorization)) {
    throw new ApiError(400, 'Attempt Authorization header is not allowed in cookie-only mode', {
      code: 'ATTEMPT_BEARER_FORBIDDEN',
    });
  }
}

function parseBearer(authHeader) {
  return authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
}

/**
 * Read raw attempt token string from cookie or bearer (mode-dependent).
 * @param {import('express').Request} req
 * @returns {string|null}
 */
export function readAttemptTokenString(req) {
  const mode = getAttemptTokenMode();
  const cookieToken = req.cookies?.[ATTEMPT_TOKEN_COOKIE_NAME] || null;
  const bearerToken = mode === 'bearer' || mode === 'dual' ? parseBearer(req.headers.authorization) : null;
  return cookieToken || bearerToken || null;
}

/**
 * Strip attempt secrets from JSON when cookie mode is active.
 * @param {Record<string, unknown>} payload
 * @returns {Record<string, unknown>}
 */
export function sanitizeAttemptTokenResponse(payload) {
  if (!isAttemptCookieMode()) return payload;
  const mode = getAttemptTokenMode();
  if (mode === 'dual') return payload;

  const out = { ...payload };
  delete out.attemptToken;
  delete out.nextAttemptToken;
  return out;
}

/**
 * @param {import('express').Response} res
 * @param {string|null|undefined} token
 * @param {Record<string, unknown>} payload
 */
export function sendAttemptTokenResponse(res, token, payload, statusCode = 200) {
  if (token) setAttemptTokenCookie(res, token);
  const body = sanitizeAttemptTokenResponse(payload);
  res.status(statusCode).json({ success: true, data: body });
}
