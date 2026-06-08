import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import { sendSuccess } from '../utils/httpEnvelope.js';
import { StructuredLogger } from '../utils/requestId.js';
import { parseStudentAttemptIdParam } from '../validators/studentAttemptLoad.schema.js';
import { saveStudentAnswerBodySchema } from '../validators/studentAnswerSave.schema.js';
import { loadStudentAttemptPage } from '../services/studentAttemptLoad.service.js';
import { saveStudentAttemptAnswer } from '../services/studentAnswerSave.service.js';

const logger = new StructuredLogger({ service: 'studentAttemptsController' });

/**
 * GET /api/student/attempts/:attemptId — load attempt page data (Phase 2B).
 */
export const getStudentAttempt = asyncHandler(async (req, res) => {
  const parsed = parseStudentAttemptIdParam(req.params.attemptId);
  if (!parsed.ok) {
    throw new ApiError(400, 'Invalid attempt id', { code: parsed.error.code });
  }

  const studentId = Number(req.user?.id);
  if (!Number.isInteger(studentId) || studentId <= 0) {
    throw new ApiError(401, 'Authentication required', { code: 'UNAUTHORIZED' });
  }

  const data = await loadStudentAttemptPage(studentId, parsed.id);
  sendSuccess(res, data);
});

/**
 * POST /api/student/attempts/:attemptId/answer — autosave one answer (Phase 2C).
 */
export const postStudentAttemptAnswer = asyncHandler(async (req, res) => {
  const parsedAttempt = parseStudentAttemptIdParam(req.params.attemptId);
  if (!parsedAttempt.ok) {
    throw new ApiError(400, 'Invalid attempt id', { code: parsedAttempt.error.code });
  }

  const parsedBody = saveStudentAnswerBodySchema.safeParse(req.body);
  if (!parsedBody.success) {
    logger.warn('student answer save validation failed', {
      userId: req.user?.id ?? null,
      issues: parsedBody.error.flatten(),
    });
    throw new ApiError(422, 'Invalid answer payload', {
      code: 'VALIDATION_ERROR',
      details: parsedBody.error.flatten(),
    });
  }

  const studentId = Number(req.user?.id);
  if (!Number.isInteger(studentId) || studentId <= 0) {
    throw new ApiError(401, 'Authentication required', { code: 'UNAUTHORIZED' });
  }

  const result = await saveStudentAttemptAnswer({
    studentId,
    attemptId: parsedAttempt.id,
    questionId: parsedBody.data.questionId,
    selectedOptionId: parsedBody.data.selectedOptionId,
  });

  sendSuccess(res, result);
});
