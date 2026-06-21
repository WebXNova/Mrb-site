import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import { sendSuccess } from '../utils/httpEnvelope.js';
import { parsePositiveTestId } from '../validators/testQuizDraft.schema.js';
import {
  deleteTestQuizDraft,
  getTestQuizDraft,
  upsertTestQuizDraft,
} from '../services/testQuizDraft.service.js';

function parseTestIdParam(params) {
  const parsed = parsePositiveTestId(params.testId);
  if (!parsed.ok) {
    throw new ApiError(400, 'Invalid test id', parsed.error);
  }
  return parsed.id;
}

function readAuthContext(req) {
  return {
    userId: Number(req.user?.id),
    role: String(req.user?.role || ''),
  };
}

export const getTestQuizDraftHandler = asyncHandler(async (req, res) => {
  const testId = parseTestIdParam(req.params);
  const { userId, role } = readAuthContext(req);
  const result = await getTestQuizDraft(testId, userId, role);
  sendSuccess(res, result);
});

export const putTestQuizDraftHandler = asyncHandler(async (req, res) => {
  const testId = parseTestIdParam(req.params);
  const { userId, role } = readAuthContext(req);
  const result = await upsertTestQuizDraft(testId, userId, role, req.body);
  sendSuccess(res, result);
});

export const deleteTestQuizDraftHandler = asyncHandler(async (req, res) => {
  const testId = parseTestIdParam(req.params);
  const { userId, role } = readAuthContext(req);
  const result = await deleteTestQuizDraft(testId, userId, role);
  sendSuccess(res, result);
});
