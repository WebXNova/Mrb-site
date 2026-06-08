import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import {
  consumeAttemptNonce,
  getAttemptResult,
  getAttemptTestForStart,
  saveAttemptAnswer,
  submitAttempt,
  verifyAttemptToken,
  createEntitledTestAttempt,
  resolveStudentIdFromRequest,
} from '../services/testAttempt.service.js';
import { loadPublishedTestMetaBySlug } from '../services/testQuestionComposition.service.js';
import { loadTestInstructionsPrep } from '../services/testInstructionsPrep.service.js';
import { sendSuccess } from '../utils/httpEnvelope.js';
import { StructuredLogger } from '../utils/requestId.js';
import { AttemptTokenInvalidError } from '../errors/testAttempt/TestAttemptErrors.js';

const logger = new StructuredLogger({ service: 'publicTestsController' });

const verifyCodeSchema = z.object({
  studentName: z.string().min(2).max(120).optional().nullable(),
});

const saveAnswerSchema = z.object({
  questionId: z.number().int().min(1),
  selectedOption: z
    .union([z.string(), z.number()])
    .transform((value) => String(value).trim())
    .pipe(z.string().min(1).max(32)),
});

function getCeeContext(req) {
  if (!req.user) {
    throw new ApiError(401, 'Authentication required');
  }

  const entitlement = req.cee?.entitlement ?? req.entitlement;
  if (!entitlement?.courseId) {
    throw new ApiError(403, 'Course entitlement required');
  }

  const studentId = resolveStudentIdFromRequest(req);
  if (!studentId) {
    throw new ApiError(401, 'Missing authenticated student identity');
  }

  return {
    entitlement,
    studentId,
    userId: studentId,
    courseId: Number(entitlement.courseId),
  };
}

function getAttemptPayload(req) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  try {
    return verifyAttemptToken(token);
  } catch (error) {
    if (error instanceof AttemptTokenInvalidError) {
      logger.warn('ATTEMPT_TOKEN_VALIDATION_FAILURE', {
        event: 'ATTEMPT_TOKEN_VALIDATION_FAILURE',
        route: req.originalUrl,
        reason: error.metadata?.reason || error.message,
        attemptId: error.metadata?.attemptId ?? null,
      });
    }
    throw error;
  }
}

function readBearerToken(req) {
  const authHeader = req.headers.authorization;
  return authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
}

export const getPublicTestMeta = asyncHandler(async (req, res) => {
  const slug = String(req.params.slug || '').trim();
  if (!slug) throw new ApiError(400, 'Invalid test link');

  const meta = await loadPublishedTestMetaBySlug(slug);
  if (!meta) throw new ApiError(404, 'Test not found');

  sendSuccess(res, meta);
});

export const getTestInstructionsPrep = asyncHandler(async (req, res) => {
  const slug = String(req.params.slug || '').trim();
  if (!slug) throw new ApiError(400, 'Invalid test link');

  const { studentId, courseId } = getCeeContext(req);
  const prep = await loadTestInstructionsPrep({ slug, studentId, courseId });
  sendSuccess(res, prep);
});

export const postVerifyTestCode = asyncHandler(async (req, res) => {
  const slug = String(req.params.slug || '').trim();
  if (!slug) throw new ApiError(400, 'Invalid test link');

  const parsed = verifyCodeSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(422, 'Invalid verification payload', parsed.error.flatten());

  const { entitlement, studentId } = getCeeContext(req);

  logger.info('ATTEMPT_CREATE_REQUEST', {
    event: 'ATTEMPT_CREATE_REQUEST',
    route: req.originalUrl,
    reqUser: {
      id: req.user?.id ?? null,
      studentId: req.user?.studentId ?? null,
      userId: req.user?.userId ?? null,
      role: req.user?.role ?? null,
    },
    studentId,
    slug,
    courseId: entitlement.courseId,
  });

  const result = await createEntitledTestAttempt({
    slug,
    studentId,
    studentName: parsed.data.studentName || null,
    ipAddress: req.ip,
    userAgent: req.get('user-agent') || null,
    entitlement,
  });

  logger.info('ATTEMPT_CREATE_SUCCESS', {
    event: 'ATTEMPT_CREATE_SUCCESS',
    route: req.originalUrl,
    studentId,
    testId: result.testId ?? null,
    attemptId: result.attemptId,
    slug,
    resumed: !!result.resumed,
  });

  sendSuccess(res, result);
});

export const getStartTest = asyncHandler(async (req, res) => {
  const slug = String(req.params.slug || '').trim();
  const { userId, courseId, entitlement } = getCeeContext(req);
  const attemptPayload = getAttemptPayload(req);
  const attemptId = Number(req.params.attemptId);
  if (!attemptId || attemptPayload.attemptId !== attemptId || attemptPayload.slug !== slug) {
    throw new ApiError(403, 'Attempt access denied');
  }

  const data = await getAttemptTestForStart({
    slug,
    attemptId,
    userId,
    courseId,
    entitlement,
    tokenNonce: attemptPayload.nonce,
  });

  const currentAttemptToken = readBearerToken(req);
  sendSuccess(res, { ...data, nextAttemptToken: currentAttemptToken });
});

export const patchSaveAnswer = asyncHandler(async (req, res) => {
  const slug = String(req.params.slug || '').trim();
  const { userId, courseId } = getCeeContext(req);
  const attemptPayload = getAttemptPayload(req);
  const attemptId = Number(req.params.attemptId);
  if (!attemptId || attemptPayload.attemptId !== attemptId || attemptPayload.slug !== slug) {
    throw new ApiError(403, 'Attempt access denied');
  }
  const nextAttemptToken = await consumeAttemptNonce({
    slug,
    attemptId,
    tokenNonce: attemptPayload.nonce,
    userId,
    courseId,
  });
  const parsed = saveAnswerSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(422, 'Invalid answer payload', parsed.error.flatten());

  const { entitlement } = getCeeContext(req);
  const data = await saveAttemptAnswer({
    attemptId,
    questionId: parsed.data.questionId,
    selectedOption: parsed.data.selectedOption,
    userId,
    courseId,
    slug,
    entitlement,
  });
  sendSuccess(res, { ...data, nextAttemptToken });
});

export const postSubmitAttempt = asyncHandler(async (req, res) => {
  const slug = String(req.params.slug || '').trim();
  const { userId, courseId } = getCeeContext(req);
  const attemptPayload = getAttemptPayload(req);
  const attemptId = Number(req.params.attemptId);
  if (!attemptId || attemptPayload.attemptId !== attemptId || attemptPayload.slug !== slug) {
    throw new ApiError(403, 'Attempt access denied');
  }
  const nextAttemptToken = await consumeAttemptNonce({
    slug,
    attemptId,
    tokenNonce: attemptPayload.nonce,
    userId,
    courseId,
  });
  const { entitlement } = getCeeContext(req);
  const data = await submitAttempt({
    attemptId,
    userId,
    courseId,
    slug,
    entitlement,
  });
  sendSuccess(res, { ...data, nextAttemptToken });
});

export const getTestResult = asyncHandler(async (req, res) => {
  const slug = String(req.params.slug || '').trim();
  const { userId, courseId } = getCeeContext(req);
  const attemptPayload = getAttemptPayload(req);
  const attemptId = Number(req.params.attemptId);
  if (!attemptId || attemptPayload.attemptId !== attemptId || attemptPayload.slug !== slug) {
    throw new ApiError(403, 'Attempt access denied');
  }
  const nextAttemptToken = await consumeAttemptNonce({
    slug,
    attemptId,
    tokenNonce: attemptPayload.nonce,
    userId,
    courseId,
  });
  const { entitlement } = getCeeContext(req);
  const data = await getAttemptResult({
    slug,
    attemptId,
    userId,
    courseId,
    entitlement,
  });
  sendSuccess(res, { ...data, nextAttemptToken });
});
