import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import {
  recoverAlreadySubmittedAttempt,
  getAttemptResult,
  getAttemptTestForStart,
  saveAttemptAnswer,
  submitAttempt,
  createEntitledTestAttempt,
  resolveStudentIdFromRequest,
} from '../services/testAttempt.service.js';
import { recordExamIntegrityStrike } from '../services/examIntegrity.service.js';
import {
  readAttemptTokenString,
  sanitizeAttemptTokenResponse,
  setAttemptTokenCookie,
  clearAttemptTokenCookie,
} from '../services/attemptTokenCookie.service.js';
import { readAndVerifyAttemptToken } from '../services/attemptTokenAuth.service.js';
import { loadPublishedTestMetaBySlug } from '../services/testQuestionComposition.service.js';
import { loadTestInstructionsPrep } from '../services/testInstructionsPrep.service.js';
import { sendSuccess } from '../utils/httpEnvelope.js';
import { StructuredLogger } from '../utils/requestId.js';
import { AttemptTokenInvalidError, TestNotFoundError } from '../errors/testAttempt/TestAttemptErrors.js';
import { assertStudentIdentity } from '../security/cee/identityGuard.js';
import { resolveActiveEntitlement } from '../services/entitlement.service.js';
import {
  assertCourseLinkedTestMetaAccessible,
  loadCourseLinkedTestAccessRowBySlug,
} from '../security/cee/courseLinkedTestAccess.service.js';

const logger = new StructuredLogger({ service: 'publicTestsController' });

const verifyCodeSchema = z
  .object({
    studentName: z.string().min(2).max(120).optional().nullable(),
  })
  .strict();

const saveAnswerSchema = z
  .object({
    questionId: z.number().int().min(1),
    selectedOption: z
      .union([z.string(), z.number()])
      .transform((value) => String(value).trim())
      .pipe(z.string().min(1).max(32)),
  })
  .strict();

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

function getAttemptPayload(req, userId) {
  try {
    const decoded = readAndVerifyAttemptToken(req);
    if (decoded.userId != null && Number(decoded.userId) !== Number(userId)) {
      throw new AttemptTokenInvalidError({
        reason: 'user_mismatch',
        attemptId: decoded.attemptId ?? null,
      });
    }
    return decoded;
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

function sendAttemptSuccess(res, data, { token = null, status = 200, requestId = null } = {}) {
  if (token) setAttemptTokenCookie(res, token);
  const body = sanitizeAttemptTokenResponse(data);
  return sendSuccess(res, body, status, requestId ? { requestId } : null);
}

export const getPublicTestMeta = asyncHandler(async (req, res) => {
  const slug = String(req.params.slug || '').trim();
  if (!slug) throw new ApiError(400, 'Invalid test link');

  const accessRow = await loadCourseLinkedTestAccessRowBySlug(slug);

  let viewerUserId = null;
  let viewerCourseId = null;
  try {
    await assertStudentIdentity(req, res, { requireVerified: true });
    const uid = Number(req.user?.id);
    if (Number.isInteger(uid) && uid > 0) {
      viewerUserId = uid;
      const entitlement = await resolveActiveEntitlement(uid);
      viewerCourseId = entitlement?.courseId ?? null;
    }
  } catch {
    viewerUserId = null;
    viewerCourseId = null;
  }

  assertCourseLinkedTestMetaAccessible(accessRow, viewerUserId, viewerCourseId);

  const meta = await loadPublishedTestMetaBySlug(slug);
  if (!meta) {
    throw new TestNotFoundError({ slug, reason: 'test_not_found' });
  }

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

  sendAttemptSuccess(res, result, { token: result.attemptToken });
});

export const getStartTest = asyncHandler(async (req, res) => {
  const slug = String(req.params.slug || '').trim();
  const { userId, courseId, entitlement } = getCeeContext(req);
  const attemptPayload = getAttemptPayload(req, userId);
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

  const currentAttemptToken = readAttemptTokenString(req);
  sendAttemptSuccess(res, { ...data, nextAttemptToken: currentAttemptToken }, {
    token: currentAttemptToken,
  });
});

export const patchSaveAnswer = asyncHandler(async (req, res) => {
  const slug = String(req.params.slug || '').trim();
  const { userId, courseId } = getCeeContext(req);
  const attemptPayload = getAttemptPayload(req, userId);
  const attemptId = Number(req.params.attemptId);
  if (!attemptId || attemptPayload.attemptId !== attemptId || attemptPayload.slug !== slug) {
    throw new ApiError(403, 'Attempt access denied');
  }
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
    tokenNonce: attemptPayload.nonce,
  });
  const currentAttemptToken = readAttemptTokenString(req);
  sendAttemptSuccess(res, { ...data, nextAttemptToken: currentAttemptToken }, {
    token: currentAttemptToken,
  });
});

export const postSubmitAttempt = asyncHandler(async (req, res) => {
  const slug = String(req.params.slug || '').trim();
  const { userId, courseId, entitlement } = getCeeContext(req);
  const attemptId = Number(req.params.attemptId);
  if (!attemptId) {
    throw new ApiError(403, 'Attempt access denied');
  }

  let attemptPayload = null;
  try {
    attemptPayload = getAttemptPayload(req, userId);
    if (attemptPayload.attemptId !== attemptId || attemptPayload.slug !== slug) {
      throw new ApiError(403, 'Attempt access denied');
    }
  } catch (error) {
    if (error instanceof AttemptTokenInvalidError) {
      const recovered = await recoverAlreadySubmittedAttempt({
        attemptId,
        userId,
        courseId,
        slug,
        entitlement,
      });
      if (recovered) {
        clearAttemptTokenCookie(res);
        sendAttemptSuccess(res, recovered, { token: null });
        return;
      }
    }
    throw error;
  }

  const data = await submitAttempt({
    attemptId,
    userId,
    courseId,
    slug,
    entitlement,
    tokenNonce: attemptPayload.nonce,
  });
  clearAttemptTokenCookie(res);
  sendAttemptSuccess(res, data, { token: null });
});

export const getTestResult = asyncHandler(async (req, res) => {
  const slug = String(req.params.slug || '').trim();
  const { userId, courseId, entitlement } = getCeeContext(req);
  const attemptId = Number(req.params.attemptId);
  if (!attemptId) {
    throw new ApiError(403, 'Attempt access denied');
  }
  const data = await getAttemptResult({
    slug,
    attemptId,
    userId,
    courseId,
    entitlement,
  });
  sendAttemptSuccess(res, data, { token: null });
});

export const postTestIntegrityEvent = asyncHandler(async (req, res) => {
  const slug = String(req.params.slug || '').trim();
  const { userId, courseId, entitlement } = getCeeContext(req);
  const attemptPayload = getAttemptPayload(req, userId);
  const attemptId = Number(req.params.attemptId);
  if (!attemptId || attemptPayload.attemptId !== attemptId || attemptPayload.slug !== slug) {
    throw new ApiError(403, 'Attempt access denied');
  }
  const strike = await recordExamIntegrityStrike({
    attemptId,
    userId,
    slug,
    courseId,
    entitlement,
    tokenNonce: attemptPayload.nonce,
  });
  if (strike.shouldSubmit) {
    const submitted = await submitAttempt({
      attemptId,
      userId,
      courseId,
      slug,
      entitlement,
      tokenNonce: attemptPayload.nonce,
    });
    sendAttemptSuccess(res, { ...submitted, ...strike }, { token: null });
    return;
  }
  sendAttemptSuccess(res, strike);
});
