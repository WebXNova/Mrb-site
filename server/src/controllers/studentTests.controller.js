import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import { sendSuccess } from '../utils/httpEnvelope.js';
import { StructuredLogger } from '../utils/requestId.js';
import { studentTestListQuerySchema } from '../validators/studentTestList.schema.js';
import { listStudentEligibleTests } from '../services/studentTestListing.service.js';
import { parseStudentTestIdParam } from '../validators/studentTestStart.schema.js';
import { startOrResumeStudentTest } from '../services/studentTestStart.service.js';

const logger = new StructuredLogger({ service: 'studentTestsController' });

/**
 * GET /api/student/tests — paginated eligible tests for owned courses.
 */
export const getStudentTests = asyncHandler(async (req, res) => {
  const parsed = studentTestListQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    logger.warn('student test list validation failed', {
      userId: req.user?.id ?? null,
      issues: parsed.error.flatten(),
    });
    throw new ApiError(422, 'Invalid query parameters', {
      code: 'VALIDATION_ERROR',
      details: parsed.error.flatten(),
    });
  }

  const studentId = Number(req.user?.id);
  if (!Number.isInteger(studentId) || studentId <= 0) {
    throw new ApiError(401, 'Authentication required', { code: 'UNAUTHORIZED' });
  }

  const data = await listStudentEligibleTests(studentId, parsed.data);

  logger.debug('student test list response', {
    studentId,
    page: parsed.data.page,
    limit: parsed.data.limit,
    count: data.items.length,
    total: data.pagination.total,
  });

  sendSuccess(res, data);
});

/**
 * POST /api/student/tests/:testId/start — start or resume a test attempt.
 */
export const postStudentTestStart = asyncHandler(async (req, res) => {
  const parsed = parseStudentTestIdParam(req.params.testId);
  if (!parsed.ok) {
    throw new ApiError(400, 'Invalid test id', { code: parsed.error.code });
  }

  const studentId = Number(req.user?.id);
  if (!Number.isInteger(studentId) || studentId <= 0) {
    throw new ApiError(401, 'Authentication required', { code: 'UNAUTHORIZED' });
  }

  const result = await startOrResumeStudentTest({
    studentId,
    testId: parsed.id,
    ipAddress: req.ip ?? null,
    userAgent: req.get('user-agent') ?? null,
  });

  logger.info('student test start completed', {
    studentId,
    testId: parsed.id,
    attemptId: result.attemptId,
    isResume: result.isResume,
  });

  sendSuccess(res, result);
});
