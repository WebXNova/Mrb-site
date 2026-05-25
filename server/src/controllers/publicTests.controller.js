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
  createPublicTestAttempt,
} from '../services/testAttempt.service.js';
import { getPublishedTestBySlug } from '../services/test.service.js';
import { sendSuccess } from '../utils/httpEnvelope.js';

const verifyCodeSchema = z.object({
  studentName: z.string().min(2).max(120).optional().nullable(),
});

const saveAnswerSchema = z.object({
  questionId: z.number().int().min(1),
  selectedOption: z.string().min(1).max(8),
});

function getAttemptPayload(req) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  return verifyAttemptToken(token);
}

export const postVerifyTestCode = asyncHandler(async (req, res) => {
  const slug = String(req.params.slug || '').trim();
  if (!slug) throw new ApiError(400, 'Invalid test link');

  const parsed = verifyCodeSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(422, 'Invalid verification payload', parsed.error.flatten());

  const result = await createPublicTestAttempt({
    slug,
    studentName: parsed.data.studentName || null,
    ipAddress: req.ip,
    userAgent: req.get('user-agent') || null,
    studentUser: req.user,
  });

  sendSuccess(res, result);
});

export const getPublicTestMeta = asyncHandler(async (req, res) => {
  const slug = String(req.params.slug || '').trim();
  if (!slug) throw new ApiError(400, 'Invalid test link');
  const test = await getPublishedTestBySlug(slug);
  if (!test) throw new ApiError(404, 'Published test not found');

  sendSuccess(res, {
    slug,
    title: test.title,
    description: test.description || '',
    subject: test.subject,
    durationMinutes: Number(test.durationMinutes || 0),
    questionCount: Number(test.questions?.length || 0),
    tags: Array.isArray(test.tags) ? test.tags : [],
    requiresCode: false,
    accessMode: 'public',
  });
});

export const getStartTest = asyncHandler(async (req, res) => {
  const slug = String(req.params.slug || '').trim();
  const attemptPayload = getAttemptPayload(req);
  const attemptId = Number(req.params.attemptId);
  if (!attemptId || attemptPayload.attemptId !== attemptId || attemptPayload.slug !== slug) {
    throw new ApiError(403, 'Attempt access denied');
  }
  const nextAttemptToken = await consumeAttemptNonce({ slug, attemptId, tokenNonce: attemptPayload.nonce });
  const data = await getAttemptTestForStart({ slug, attemptId });
  sendSuccess(res, { ...data, nextAttemptToken });
});

export const patchSaveAnswer = asyncHandler(async (req, res) => {
  const slug = String(req.params.slug || '').trim();
  const attemptPayload = getAttemptPayload(req);
  const attemptId = Number(req.params.attemptId);
  if (!attemptId || attemptPayload.attemptId !== attemptId || attemptPayload.slug !== slug) {
    throw new ApiError(403, 'Attempt access denied');
  }
  const nextAttemptToken = await consumeAttemptNonce({ slug, attemptId, tokenNonce: attemptPayload.nonce });
  const parsed = saveAnswerSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(422, 'Invalid answer payload', parsed.error.flatten());

  const data = await saveAttemptAnswer({
    attemptId,
    questionId: parsed.data.questionId,
    selectedOption: parsed.data.selectedOption,
  });
  sendSuccess(res, { ...data, nextAttemptToken });
});

export const postSubmitAttempt = asyncHandler(async (req, res) => {
  const slug = String(req.params.slug || '').trim();
  const attemptPayload = getAttemptPayload(req);
  const attemptId = Number(req.params.attemptId);
  if (!attemptId || attemptPayload.attemptId !== attemptId || attemptPayload.slug !== slug) {
    throw new ApiError(403, 'Attempt access denied');
  }
  const nextAttemptToken = await consumeAttemptNonce({ slug, attemptId, tokenNonce: attemptPayload.nonce });
  const data = await submitAttempt({ attemptId });
  sendSuccess(res, { ...data, nextAttemptToken });
});

export const getTestResult = asyncHandler(async (req, res) => {
  const slug = String(req.params.slug || '').trim();
  const attemptPayload = getAttemptPayload(req);
  const attemptId = Number(req.params.attemptId);
  if (!attemptId || attemptPayload.attemptId !== attemptId || attemptPayload.slug !== slug) {
    throw new ApiError(403, 'Attempt access denied');
  }
  const nextAttemptToken = await consumeAttemptNonce({ slug, attemptId, tokenNonce: attemptPayload.nonce });
  const data = await getAttemptResult({ slug, attemptId });
  sendSuccess(res, { ...data, nextAttemptToken });
});
