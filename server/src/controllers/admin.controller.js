import { asyncHandler } from '../utils/asyncHandler.js';
import { dashboardStats, listUsers, updateUserStatus } from '../services/user.service.js';
import { ApiError } from '../utils/apiError.js';
import { listRecentActivityLogs, logActivity } from '../services/activityLog.service.js';
import { sendSuccess } from '../utils/httpEnvelope.js';

export const getDashboard = asyncHandler(async (req, res) => {
  const stats = await dashboardStats();
  const recentLogs = await listRecentActivityLogs(10);
  sendSuccess(res, { stats, recentLogs });
});

export const getUsers = asyncHandler(async (req, res) => {
  const users = await listUsers();
  sendSuccess(res, users);
});

export const getLogs = asyncHandler(async (req, res) => {
  const logs = await listRecentActivityLogs(100);
  sendSuccess(res, logs);
});

export const putUserStatus = asyncHandler(async (req, res) => {
  const userId = Number(req.params.userId);
  const status = req.body?.status;
  if (!userId) throw new ApiError(400, 'Invalid user id');
  if (status !== 'active' && status !== 'suspended') {
    throw new ApiError(422, 'status must be either active or suspended');
  }

  const updated = await updateUserStatus(userId, status);
  if (!updated) throw new ApiError(404, 'User not found');

  await logActivity({
    userId: req.user?.id,
    role: req.user?.role,
    action: 'admin.user.status.update',
    entityType: 'user',
    entityId: String(userId),
    metadata: { status },
  });

  sendSuccess(res, updated);
});
