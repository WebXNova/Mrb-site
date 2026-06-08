/**
 * Submit Test HTTP handler.
 */

import { AppError } from '../errors/base/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import { submitAttempt as executeSubmit } from './submit.service.js';

function sendSubmitFailure(res, status, message) {
  return res.status(status).json({ success: false, message });
}

/**
 * POST /api/attempts/:attempt_id/submit
 * Requires student auth + attemptGuard upstream.
 */
export const submitTest = asyncHandler(async (req, res) => {
  const attemptSession = req.attemptSession;
  if (!attemptSession) {
    return sendSubmitFailure(res, 500, 'Attempt session not resolved');
  }

  try {
    await executeSubmit(attemptSession);
  } catch (error) {
    if (error instanceof AppError) {
      return sendSubmitFailure(res, error.httpStatus, error.message);
    }
    if (error instanceof ApiError) {
      return sendSubmitFailure(res, error.status, error.message);
    }
    throw error;
  }

  return res.status(200).json({ success: true, message: 'Test submitted successfully' });
});
