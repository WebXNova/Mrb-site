import { asyncHandler } from '../utils/asyncHandler.js';
import { dashboardStats, listUsers, updateUserStatus } from '../services/user.service.js';
import { listCodes, generateCodes, deleteUnusedCode } from '../services/mrbCode.service.js';
import { ActivityLog } from '../models/activityLog.model.js';
import { ApiError } from '../utils/apiError.js';
import { logActivity } from '../services/activityLog.service.js';

export const getDashboard = asyncHandler(async (req, res) => {
  const stats = await dashboardStats();
  const recentLogs = await ActivityLog.find().sort({ createdAt: -1 }).limit(10).lean();
  res.json({ success: true, data: { stats, recentLogs } });
});

export const getUsers = asyncHandler(async (req, res) => {
  const users = await listUsers();
  res.json({ success: true, data: users });
});

export const getMrbCodes = asyncHandler(async (req, res) => {
  const codes = await listCodes();
  res.json({ success: true, data: codes });
});

export const postMrbCodes = asyncHandler(async (req, res) => {
  const count = Number(req.body?.count || 1);
  const batchLabel = req.body?.batchLabel || null;
  const expiresAt = req.body?.expiresAt || null;

  if (!Number.isFinite(count) || count < 1 || count > 500) {
    throw new ApiError(422, 'count must be between 1 and 500');
  }

  const codes = await generateCodes({ count, batchLabel, expiresAt });
  await logActivity({
    userId: req.user?.id,
    role: req.user?.role,
    action: 'admin.mrb_codes.generate',
    entityType: 'mrb_code',
    metadata: { count, batchLabel },
  });
  res.status(201).json({ success: true, data: codes });
});

export const removeMrbCode = asyncHandler(async (req, res) => {
  const codeId = Number(req.params.codeId);
  if (!codeId) throw new ApiError(400, 'Invalid code id');
  const removed = await deleteUnusedCode(codeId);
  if (!removed) throw new ApiError(404, 'Unused MRB code not found');

  await logActivity({
    userId: req.user?.id,
    role: req.user?.role,
    action: 'admin.mrb_code.delete',
    entityType: 'mrb_code',
    entityId: String(codeId),
  });
  res.json({ success: true, message: 'Code deleted' });
});

export const getLogs = asyncHandler(async (req, res) => {
  const logs = await ActivityLog.find().sort({ createdAt: -1 }).limit(100).lean();
  res.json({ success: true, data: logs });
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

  res.json({ success: true, data: updated });
});
