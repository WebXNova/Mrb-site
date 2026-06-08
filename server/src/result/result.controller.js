/**
 * Result API HTTP handler — read-only.
 */

import { AppError } from '../errors/base/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import { parsePositiveInt } from '../attempt/attempt.util.js';
import { getResult as fetchResult } from './result.service.js';

function sendResultFailure(res, status, message) {
  return res.status(status).json({ success: false, message });
}

/**
 * GET /api/attempts/:attempt_id/result
 */
export const getResult = asyncHandler(async (req, res) => {
  const studentId = parsePositiveInt(req.user?.id);
  if (studentId == null) {
    return sendResultFailure(res, 401, 'Authentication required');
  }

  const attemptId = parsePositiveInt(req.params.attempt_id ?? req.params.attemptId);
  if (attemptId == null) {
    return sendResultFailure(res, 400, 'Invalid attempt id');
  }

  try {
    const data = await fetchResult(studentId, attemptId);
    return res.status(200).json({
      success: true,
      test_title: data.test_title,
      test_id: data.test_id,
      submitted_at: data.submitted_at,
      ...data.summary,
      ...(data.answers ? { answers: data.answers } : {}),
    });
  } catch (error) {
    if (error instanceof AppError) {
      return sendResultFailure(res, error.httpStatus, error.message);
    }
    if (error instanceof ApiError) {
      return sendResultFailure(res, error.status, error.message);
    }
    throw error;
  }
});
