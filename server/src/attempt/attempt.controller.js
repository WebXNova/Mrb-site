/**
 * Attempt session HTTP handlers — read-only session access.
 */

import { mysqlPool } from '../config/mysql.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import { sendSuccess } from '../utils/httpEnvelope.js';
import { toAttemptSessionDto } from './attempt.dto.js';
import { getActiveAttempt } from './attempt.service.js';
import { parsePositiveInt } from './attempt.util.js';

/**
 * GET /api/attempt/:attemptId
 * Requires attemptGuard upstream (token + ownership + expiry).
 */
export const getAttempt = asyncHandler(async (req, res) => {
  const row = req.attemptSession;
  if (!row) {
    throw new ApiError(500, 'Attempt session not resolved', { code: 'ATTEMPT_GUARD_MISSING' });
  }

  sendSuccess(
    res,
    toAttemptSessionDto({
      id: row.id,
      test_id: row.testId,
      status: row.status,
      started_at: row.startedAt,
      expires_at: row.expiresAt,
    })
  );
});

/**
 * GET /api/attempt/tests/:testId/active
 * Returns the student's active attempt for a test (JWT auth only; scoped by student_id).
 */
export const getActiveAttemptForTest = asyncHandler(async (req, res) => {
  const studentId = parsePositiveInt(req.user?.id);
  if (studentId == null) {
    throw new ApiError(401, 'Authentication required', { code: 'UNAUTHORIZED' });
  }

  const testId = parsePositiveInt(req.params.testId);
  if (testId == null) {
    throw new ApiError(400, 'Invalid test id', { code: 'INVALID_TEST_ID' });
  }

  const attemptRow = await getActiveAttempt(mysqlPool, studentId, testId);
  if (!attemptRow) {
    sendSuccess(res, null);
    return;
  }

  sendSuccess(res, toAttemptSessionDto(attemptRow));
});
