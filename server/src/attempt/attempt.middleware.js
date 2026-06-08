/**
 * Attempt session guard — blocks IDOR, token bypass, and expired attempts.
 *
 * Requires:
 * - Authenticated student (req.user.id from upstream auth middleware)
 * - :attemptId route param
 * - Authorization: Bearer <attempt_token> (maps to attempt_nonce)
 *
 * On success attaches req.attemptSession (sanitized row, no token).
 */

import { mysqlPool } from '../config/mysql.js';
import { ApiError } from '../utils/apiError.js';
import { StructuredLogger } from '../utils/requestId.js';
import { validateAttemptAccess } from './attempt.service.js';
import { parsePositiveInt, readAttemptBearerToken } from './attempt.util.js';

const logger = new StructuredLogger({ service: 'attemptCoreGuard' });

/**
 * Express middleware — fail-closed attempt session validation.
 */
export async function attemptGuard(req, res, next) {
  try {
    const studentId = parsePositiveInt(req.user?.id);
    if (studentId == null) {
      throw new ApiError(401, 'Authentication required', { code: 'UNAUTHORIZED' });
    }

    const attemptId = parsePositiveInt(req.params.attemptId ?? req.params.attempt_id);
    if (attemptId == null) {
      throw new ApiError(400, 'Invalid attempt id', { code: 'INVALID_ATTEMPT_ID' });
    }

    const attemptToken = readAttemptBearerToken(req);
    if (!attemptToken) {
      logger.warn('attempt guard rejected — missing bearer token', {
        attemptId,
        studentId,
        event: 'ATTEMPT_TOKEN_MISSING',
      });
      throw new ApiError(401, 'Attempt token is required', { code: 'ATTEMPT_TOKEN_REQUIRED' });
    }

    const attemptRow = await validateAttemptAccess(mysqlPool, attemptId, studentId, {
      attemptToken,
      requireToken: true,
    });

    req.attemptSession = {
      id: Number(attemptRow.id),
      testId: Number(attemptRow.test_id),
      studentId: Number(attemptRow.student_id),
      status: String(attemptRow.status),
      startedAt: attemptRow.started_at == null ? null : String(attemptRow.started_at),
      expiresAt: attemptRow.expires_at == null ? null : String(attemptRow.expires_at),
    };

    next();
  } catch (error) {
    next(error);
  }
}
