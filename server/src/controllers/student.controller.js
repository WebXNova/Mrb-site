import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import { getStudentDashboard, getStudentResultByAttempt } from '../services/studentPortal.service.js';
import { sendSuccess } from '../utils/httpEnvelope.js';

export const getStudentDashboardData = asyncHandler(async (req, res) => {
  const data = await getStudentDashboard(req.user.id);
  sendSuccess(res, data);
});

export const getStudentResultDetail = asyncHandler(async (req, res) => {
  const attemptId = Number(req.params.attemptId);
  if (!attemptId) throw new ApiError(400, 'Invalid attempt id');
  const courseId = Number(req.cee?.courseId ?? req.entitlement?.courseId);
  if (!courseId) throw new ApiError(403, 'Course entitlement required');
  const data = await getStudentResultByAttempt(req.user.id, attemptId, courseId);
  if (!data) throw new ApiError(404, 'Result not found');
  sendSuccess(res, data);
});
