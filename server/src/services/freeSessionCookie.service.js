import crypto from 'crypto';
import { env } from '../config/env.js';
import { FREE_SESSION_COOKIE_NAME } from '../constants/freeSession.constants.js';

const COOKIE_BYTES = 32;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export { FREE_SESSION_COOKIE_NAME };

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: env.security.attemptCookieSameSite,
    secure: env.security.attemptCookieSecure,
    path: env.security.attemptCookiePath || '/api',
  };
}

export function hashFreeSessionToken(rawToken) {
  const token = String(rawToken || '').trim();
  if (!token) return null;
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function readFreeSessionToken(req) {
  const raw = req?.cookies?.[FREE_SESSION_COOKIE_NAME];
  return raw ? String(raw).trim() : '';
}

export function readFreeSessionHash(req) {
  return hashFreeSessionToken(readFreeSessionToken(req));
}

/**
 * Ensure a guest cookie exists. Returns { token, hash, issued }.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export function ensureFreeSessionCookie(req, res) {
  const existing = readFreeSessionToken(req);
  if (existing) {
    const hash = hashFreeSessionToken(existing);
    return { token: existing, hash, issued: false };
  }
  const token = crypto.randomBytes(COOKIE_BYTES).toString('hex');
  const hash = hashFreeSessionToken(token);
  res.cookie(FREE_SESSION_COOKIE_NAME, token, {
    ...cookieOptions(),
    maxAge: SEVEN_DAYS_MS,
  });
  return { token, hash, issued: true };
}

export function clearFreeSessionCookie(res) {
  res.clearCookie(FREE_SESSION_COOKIE_NAME, cookieOptions());
}
