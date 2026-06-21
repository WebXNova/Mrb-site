import { asyncHandler } from '../utils/asyncHandler.js';
import {
  dashboardStats,
  getUserSummary,
  listUsers,
  updateUserStatus,
} from '../services/user.service.js';
import { ApiError } from '../utils/apiError.js';
import { listRecentActivityLogs, logActivity } from '../services/activityLog.service.js';
import { revokeAllAuthSessionsForUser } from '../services/authSession.service.js';
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

  const target = await getUserSummary(userId);
  if (!target) throw new ApiError(404, 'User not found');

  // Hard guard: only `student` accounts may be suspended/reactivated through this admin path.
  // Suspending an admin/super_admin/teacher must go through dedicated, more guarded flows.
  const targetRole = String(target.role || '').toLowerCase();
  if (targetRole !== 'student') {
    throw new ApiError(403, 'Only student accounts can be suspended or reactivated here');
  }

  const actorId = Number(req.user?.id);
  if (Number.isInteger(actorId) && actorId === userId) {
    throw new ApiError(403, 'Admins cannot change their own account status');
  }

  const updated = await updateUserStatus(userId, status);
  if (!updated) throw new ApiError(404, 'User not found');

  let sessionsRevoked = false;
  if (status === 'suspended') {
    try {
      await revokeAllAuthSessionsForUser(userId);
      sessionsRevoked = true;
    } catch (error) {
      // Log but do not roll back the status change — the user is suspended, sessions
      // will fail on next refresh because revoke is best-effort here.
      console.error('[admin.putUserStatus] revokeAllAuthSessionsForUser failed', error?.message);
    }
  }

  await logActivity({
    userId: actorId || null,
    role: req.user?.role,
    action: 'admin.user.status.update',
    entityType: 'user',
    entityId: String(userId),
    metadata: {
      status,
      targetRole,
      sessionsRevoked,
    },
  });

  sendSuccess(res, updated);
});
