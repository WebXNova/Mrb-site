import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import { getStudentDashboard, getStudentResultByAttempt } from '../services/studentPortal.service.js';

export const getStudentDashboardData = asyncHandler(async (req, res) => {
  const data = await getStudentDashboard(req.user.id);
  res.json({ success: true, data });
});

export const getStudentResultDetail = asyncHandler(async (req, res) => {
  const attemptId = Number(req.params.attemptId);
  if (!attemptId) throw new ApiError(400, 'Invalid attempt id');
  const data = await getStudentResultByAttempt(req.user.id, attemptId);
  if (!data) throw new ApiError(404, 'Result not found');
  res.json({ success: true, data });
});
