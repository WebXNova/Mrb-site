import { verifyAttemptToken } from './testAttempt.service.js';
import {
  readAttemptTokenString,
  rejectAttemptBearerInCookieOnlyMode,
} from './attemptTokenCookie.service.js';

/**
 * Resolve and verify attempt JWT from HttpOnly cookie (preferred) or Bearer (legacy/dual).
 * @param {import('express').Request} req
 */
export function readAndVerifyAttemptToken(req) {
  rejectAttemptBearerInCookieOnlyMode(req);
  return verifyAttemptToken(readAttemptTokenString(req));
}
