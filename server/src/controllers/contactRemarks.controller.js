import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import { logActivity } from '../services/activityLog.service.js';
import {
  createContactRemark,
  listContactRemarks,
  markContactRemarkAsRead,
} from '../services/contactRemark.service.js';

const contactRemarkSchema = z.object({
  name: z.string().max(120).optional().nullable(),
  email: z.string().email().max(255).optional().nullable(),
  message: z.string().min(5).max(5000),
  pageUrl: z.string().max(255).optional().nullable(),
});

export const postContactRemark = asyncHandler(async (req, res) => {
  const parsed = contactRemarkSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(422, 'Invalid remark payload', parsed.error.flatten());
  const created = await createContactRemark(parsed.data);
  res.status(201).json({
    success: true,
    message: 'Remark received successfully',
    data: created,
  });
});

export const getAdminContactRemarks = asyncHandler(async (req, res) => {
  const rows = await listContactRemarks();
  res.json({ success: true, data: rows });
});

export const putAdminContactRemarkRead = asyncHandler(async (req, res) => {
  const remarkId = Number(req.params.remarkId);
  if (!remarkId) throw new ApiError(400, 'Invalid remark id');
  const updated = await markContactRemarkAsRead(remarkId);
  if (!updated) throw new ApiError(404, 'Remark not found');
  await logActivity({
    userId: req.user?.id,
    role: req.user?.role,
    action: 'admin.contact_remark.mark_read',
    entityType: 'contact_remark',
    entityId: String(remarkId),
  });
  res.json({ success: true, data: updated });
});
