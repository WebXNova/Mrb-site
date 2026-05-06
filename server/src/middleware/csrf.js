import crypto from 'crypto';
import { ApiError } from '../utils/apiError.js';

export const CSRF_COOKIE_NAME = 'csrf_token';
export const CSRF_HEADER_NAME = 'x-csrf-token';

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''), 'utf8');
  const right = Buffer.from(String(b || ''), 'utf8');
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

export function issueCsrfToken() {
  return crypto.randomBytes(32).toString('hex');
}

export function requireCsrf(req, res, next) {
  const cookieToken = req.cookies?.[CSRF_COOKIE_NAME];
  const headerToken = req.get(CSRF_HEADER_NAME);
  if (!cookieToken || !headerToken) {
    return next(new ApiError(403, 'Invalid CSRF token'));
  }
  if (!safeEqual(cookieToken, headerToken)) {
    return next(new ApiError(403, 'Invalid CSRF token'));
  }
  return next();
}
