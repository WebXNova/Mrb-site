import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import { sendSuccess } from '../utils/httpEnvelope.js';
import { courseDraftSaveBodySchema } from '../validators/courseDraft.schema.js';
import { loadCourseDraft, saveCourseDraft } from '../services/courseDraft.service.js';

function readUserId(req) {
  const userId = Number(req.user?.id);
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new ApiError(401, 'Authentication required', { code: 'AUTH_REQUIRED' });
  }
  return userId;
}

export const getCourseDraftHandler = asyncHandler(async (req, res) => {
  const result = await loadCourseDraft(readUserId(req));
  sendSuccess(res, result);
});

export const postCourseDraftSaveHandler = asyncHandler(async (req, res) => {
  const parsed = courseDraftSaveBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    throw new ApiError(422, 'Invalid course draft payload', parsed.error.flatten());
  }

  const result = await saveCourseDraft(readUserId(req), parsed.data);
  sendSuccess(res, result);
});
