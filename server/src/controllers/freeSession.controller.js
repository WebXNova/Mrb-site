import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import { sendSuccess } from '../utils/httpEnvelope.js';
import { AttemptInvalidStateError, AttemptTokenInvalidError } from '../errors/testAttempt/TestAttemptErrors.js';
import {
  startFreeSessionAttempt,
  getFreeSessionStatus,
  saveFreeSessionEnrollment,
  claimFreeSessionAttempt,
} from '../services/freeSession.service.js';
import {
  getAttemptTestForStart,
  saveAttemptAnswer,
  submitAttempt,
} from '../services/testAttempt.service.js';
import { recordGuestExamIntegrityStrike } from '../services/examIntegrity.service.js';
import { readAndVerifyAttemptToken } from '../services/attemptTokenAuth.service.js';
import {
  sanitizeAttemptTokenResponse,
  setAttemptTokenCookie,
} from '../services/attemptTokenCookie.service.js';
import {
  ensureFreeSessionCookie,
  readFreeSessionHash,
  clearFreeSessionCookie,
} from '../services/freeSessionCookie.service.js';

function parseStudentId(req) {
  const userId = Number(req.user?.id);
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new ApiError(401, 'Authentication required');
  }
  return userId;
}

function requireGuestSessionHash(req) {
  const hash = readFreeSessionHash(req);
  if (!hash) {
    throw new ApiError(401, 'Your test session could not be found. Open the original test link and try again.');
  }
  return hash;
}

function resolveGuestAttemptActor(req) {
  const decoded = readAndVerifyAttemptToken(req);
  if (decoded.guest !== true) {
    throw new AttemptTokenInvalidError({ reason: 'not_guest_attempt' });
  }
  const hash = requireGuestSessionHash(req);
  if (String(decoded.sessionHash || '') !== hash) {
    throw new AttemptTokenInvalidError({ reason: 'guest_session_mismatch' });
  }
  const slug = String(req.params.slug || '').trim();
  const attemptId = Number(req.params.attemptId);
  if (!attemptId || Number(decoded.attemptId) !== attemptId || String(decoded.slug) !== slug) {
    throw new ApiError(403, 'Attempt access denied');
  }
  return { guestSessionHash: hash, decoded, attemptId, slug };
}

export const getFreeSessionStatusHandler = asyncHandler(async (req, res) => {
  const data = await getFreeSessionStatus({
    slug: String(req.params.slug || '').trim(),
    guestSessionHash: readFreeSessionHash(req),
  });
  sendSuccess(res, data);
});

export const postFreeSessionStart = asyncHandler(async (req, res) => {
  const { hash } = ensureFreeSessionCookie(req, res);
  const result = await startFreeSessionAttempt({
    slug: String(req.params.slug || '').trim(),
    guestSessionHash: hash,
    studentName: req.body?.studentName ?? req.body?.name,
    ipAddress: req.ip,
    userAgent: req.get('user-agent') || null,
  });
  if (result.attemptToken) setAttemptTokenCookie(res, result.attemptToken);
  sendSuccess(res, sanitizeAttemptTokenResponse(result), result.resumed ? 200 : 201);
});

export const postFreeSessionEnrollment = asyncHandler(async (req, res) => {
  const data = await saveFreeSessionEnrollment({
    slug: String(req.params.slug || '').trim(),
    guestSessionHash: requireGuestSessionHash(req),
    body: req.body,
  });
  sendSuccess(res, data);
});

export const postFreeSessionClaim = asyncHandler(async (req, res) => {
  const data = await claimFreeSessionAttempt({
    slug: String(req.params.slug || '').trim(),
    guestSessionHash: requireGuestSessionHash(req),
    studentId: parseStudentId(req),
  });
  clearFreeSessionCookie(res);
  sendSuccess(res, data);
});

export const getFreeSessionAttemptStart = asyncHandler(async (req, res) => {
  const actor = resolveGuestAttemptActor(req);
  try {
    const data = await getAttemptTestForStart({
      slug: actor.slug,
      attemptId: actor.attemptId,
      userId: 0,
      tokenNonce: actor.decoded.nonce,
      guestSessionHash: actor.guestSessionHash,
    });
    sendSuccess(res, data);
  } catch (error) {
    if (error instanceof AttemptInvalidStateError) {
      const status = await getFreeSessionStatus({
        slug: actor.slug,
        guestSessionHash: actor.guestSessionHash,
      });
      sendSuccess(res, { submitted: true, ...status });
      return;
    }
    throw error;
  }
});

export const patchFreeSessionAttemptAnswer = asyncHandler(async (req, res) => {
  const actor = resolveGuestAttemptActor(req);
  const data = await saveAttemptAnswer({
    slug: actor.slug,
    attemptId: actor.attemptId,
    userId: 0,
    questionId: Number(req.body?.questionId),
    selectedOption: req.body?.selectedOption,
    tokenNonce: actor.decoded.nonce,
    guestSessionHash: actor.guestSessionHash,
  });
  sendSuccess(res, data);
});

export const postFreeSessionAttemptSubmit = asyncHandler(async (req, res) => {
  const actor = resolveGuestAttemptActor(req);
  const data = await submitAttempt({
    slug: actor.slug,
    attemptId: actor.attemptId,
    userId: 0,
    tokenNonce: actor.decoded.nonce,
    guestSessionHash: actor.guestSessionHash,
  });
  sendSuccess(res, data);
});

export const postFreeSessionIntegrityEvent = asyncHandler(async (req, res) => {
  const actor = resolveGuestAttemptActor(req);
  const strike = await recordGuestExamIntegrityStrike({
    attemptId: actor.attemptId,
    slug: actor.slug,
    tokenNonce: actor.decoded.nonce,
    guestSessionHash: actor.guestSessionHash,
  });
  if (strike.shouldSubmit) {
    const submitted = await submitAttempt({
      slug: actor.slug,
      attemptId: actor.attemptId,
      userId: 0,
      tokenNonce: actor.decoded.nonce,
      guestSessionHash: actor.guestSessionHash,
    });
    sendSuccess(res, { ...submitted, ...strike });
    return;
  }
  sendSuccess(res, strike);
});
