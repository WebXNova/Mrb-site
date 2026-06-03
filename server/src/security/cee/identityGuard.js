/**
 * CEE identity layer — JWT/session validation only (no access decisions).
 */

import { evaluateAccessRequest } from '../../services/authDecisionEngine.js';
import { requireStudentVerified } from '../../middleware/requireStudentVerified.js';
import { UnauthorizedError } from '../../errors/entitlement/EntitlementErrors.js';
import { ApiError } from '../../utils/apiError.js';

function runMiddleware(middleware, req, res) {
  return new Promise((resolve, reject) => {
    middleware(req, res, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

/**
 * Establish authenticated student identity on req.user (fail-closed).
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {{ requireVerified?: boolean }} [options]
 */
export async function assertStudentIdentity(req, res, options = {}) {
  const { requireVerified = true } = options;
  try {
    const payload = await evaluateAccessRequest(req, { expectedRole: 'student' });
    req.user = payload;
    if (requireVerified) {
      await runMiddleware(requireStudentVerified, req, res);
    }
  } catch (error) {
    if (error instanceof ApiError && error.statusCode === 401) {
      throw new UnauthorizedError({ reason: 'invalid_session', message: error.message });
    }
    if (error instanceof ApiError && error.statusCode === 403) {
      throw error;
    }
    throw new UnauthorizedError({ reason: 'identity_verification_failed' });
  }
}
