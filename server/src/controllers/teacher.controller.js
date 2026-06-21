import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/httpEnvelope.js';
import { getTeacherProfileForSelf } from '../services/teacher.service.js';

/**
 * Self profile — identity is always taken from req.user.id (session JWT).
 * Query/path teacher ids are intentionally ignored to prevent IDOR.
 */
export const getTeacherProfile = asyncHandler(async (req, res) => {
  const profile = await getTeacherProfileForSelf(req.user.id);
  sendSuccess(res, profile);
});
