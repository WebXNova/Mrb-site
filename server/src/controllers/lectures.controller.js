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
import { sendSuccess } from '../utils/httpEnvelope.js';
import {
  parseAdminListFilters,
  resolveHierarchyCourseScope,
} from '../utils/parseAdminListFilters.js';
import { mysqlPool } from '../config/mysql.js';

const YOUTUBE_URL_REGEX =
  /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=[\w-]{11}(&.*)?|youtu\.be\/[\w-]{11}(\?.*)?)$/i;

function preprocessLectureBody(raw) {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return raw;
  }
  const obj = { ...raw };
  if (obj.chapter_id != null && obj.chapterId == null) obj.chapterId = obj.chapter_id;
  if (obj.sort_order != null && obj.sortOrder == null) obj.sortOrder = obj.sort_order;
  if (obj.is_active != null && obj.isActive == null) obj.isActive = obj.is_active;
  if (obj.youtube_url != null && obj.youtubeUrl == null) obj.youtubeUrl = obj.youtube_url;
  delete obj.chapter_id;
  delete obj.course_id;
  delete obj.courseId;
  delete obj.sort_order;
  delete obj.is_active;
  delete obj.youtube_url;
  return obj;
}

const lectureSchema = z.preprocess(
  preprocessLectureBody,
  z
    .object({
      chapterId: z.number({ invalid_type_error: 'chapterId must be a number' }).int().positive(),
      title: z.string().min(3).max(220),
      youtubeUrl: z
        .string()
        .url()
        .refine((value) => YOUTUBE_URL_REGEX.test(value), 'youtubeUrl must be a valid YouTube watch URL'),
      topic: z.string().max(120).optional().nullable(),
      sortOrder: z.number().int().min(0).optional(),
      isActive: z.boolean().optional(),
    })
    .strict()
);

export const getLectures = asyncHandler(async (req, res) => {
  const parsed = parseAdminListFilters(req.query, { defaultLimit: 100, maxLimit: 500 });
  const scope = await resolveHierarchyCourseScope(mysqlPool, parsed);

  const lectures = await listLectures({
    ...parsed,
    courseId: scope.courseId,
    subjectId: scope.subjectId,
    chapterId: scope.chapterId,
  });

  if (lectures && typeof lectures === 'object' && Array.isArray(lectures.items)) {
    sendSuccess(res, lectures);
    return;
  }

  sendSuccess(res, lectures);
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
    metadata: {
      chapterId: created.chapterId,
      subjectId: created.subjectId,
      courseId: created.courseId,
    },
  });
  sendSuccess(res, created, 201);
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
    metadata: {
      chapterId: updated.chapterId,
      subjectId: updated.subjectId,
      courseId: updated.courseId,
    },
  });
  sendSuccess(res, updated);
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
  sendSuccess(res, { message: 'Lecture deleted' });
});
