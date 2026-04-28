import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import {
  createLecture,
  deleteLecture,
  listLectures,
  updateLecture,
} from '../services/lecture.service.js';
import { logActivity } from '../services/activityLog.service.js';

const lectureSchema = z.object({
  courseId: z.number().int().positive(),
  title: z.string().min(3).max(220),
  youtubeUrl: z.string().url(),
  topic: z.string().max(120).optional().nullable(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

export const getLectures = asyncHandler(async (req, res) => {
  const lectures = await listLectures();
  res.json({ success: true, data: lectures });
});

export const postLecture = asyncHandler(async (req, res) => {
  const parsed = lectureSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(422, 'Invalid lecture payload', parsed.error.flatten());
  }
  const created = await createLecture(parsed.data);
  await logActivity({
    userId: req.user?.id,
    role: req.user?.role,
    action: 'admin.lecture.create',
    entityType: 'lecture',
    entityId: String(created.id),
  });
  res.status(201).json({ success: true, data: created });
});

export const putLecture = asyncHandler(async (req, res) => {
  const lectureId = Number(req.params.lectureId);
  if (!lectureId) throw new ApiError(400, 'Invalid lecture id');

  const parsed = lectureSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(422, 'Invalid lecture payload', parsed.error.flatten());
  }

  const updated = await updateLecture(lectureId, parsed.data);
  if (!updated) throw new ApiError(404, 'Lecture not found');

  await logActivity({
    userId: req.user?.id,
    role: req.user?.role,
    action: 'admin.lecture.update',
    entityType: 'lecture',
    entityId: String(lectureId),
  });
  res.json({ success: true, data: updated });
});

export const removeLecture = asyncHandler(async (req, res) => {
  const lectureId = Number(req.params.lectureId);
  if (!lectureId) throw new ApiError(400, 'Invalid lecture id');

  const removed = await deleteLecture(lectureId);
  if (!removed) throw new ApiError(404, 'Lecture not found');

  await logActivity({
    userId: req.user?.id,
    role: req.user?.role,
    action: 'admin.lecture.delete',
    entityType: 'lecture',
    entityId: String(lectureId),
  });
  res.json({ success: true, message: 'Lecture deleted' });
});
