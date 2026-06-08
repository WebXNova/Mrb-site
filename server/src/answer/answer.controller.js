/**
 * Answer Storage HTTP handler.
 */

import { mysqlPool } from '../config/mysql.js';
import { AppError } from '../errors/base/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import { saveAnswer as persistAnswer } from './answer.service.js';
import { saveAnswerBodySchema } from './answer.schema.js';

function sendAnswerFailure(res, status, message) {
  return res.status(status).json({ success: false, message });
}

/**
 * POST /api/attempts/:attempt_id/answers
 * Requires student auth + attemptGuard upstream.
 */
export const saveAnswer = asyncHandler(async (req, res) => {
  const parsed = saveAnswerBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return sendAnswerFailure(res, 422, 'Invalid answer payload');
  }

  const attemptSession = req.attemptSession;
  if (!attemptSession) {
    return sendAnswerFailure(res, 500, 'Attempt session not resolved');
  }

  try {
    await persistAnswer(mysqlPool, attemptSession, {
      questionId: parsed.data.question_id,
      selectedOptionId: parsed.data.selected_option_id,
    });
  } catch (error) {
    if (error instanceof AppError) {
      return sendAnswerFailure(res, error.httpStatus, error.message);
    }
    if (error instanceof ApiError) {
      return sendAnswerFailure(res, error.status, error.message);
    }
    throw error;
  }

  return res.status(200).json({ success: true, message: 'Answer saved' });
});
