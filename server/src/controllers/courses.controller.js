import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import {
  createCourse,
  deleteCourse,
  listCourses,
  updateCourse,
} from '../services/course.service.js';
import { logActivity } from '../services/activityLog.service.js';

const courseSchema = z.object({
  slug: z.string().min(3).max(180).optional(),
  title: z.string().min(2).max(180),
  subject: z.string().min(2).max(80),
  description: z.string().min(10),
  price: z.number().int().min(0),
  originalPrice: z.number().int().min(0).nullable().optional(),
  accentColor: z.string().optional().nullable(),
  level: z.string().optional().nullable(),
  instructor: z.string().optional().nullable(),
  lecturesCount: z.string().optional(),
  testsCount: z.string().optional(),
  durationWeeks: z.number().int().min(0).optional(),
  rating: z.number().min(0).max(5).optional(),
  studentsEnrolled: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

function slugify(value) {
  return value.toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
}

export const getCourses = asyncHandler(async (req, res) => {
  const courses = await listCourses();
  res.json({ success: true, data: courses });
});

export const postCourse = asyncHandler(async (req, res) => {
  const parsed = courseSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(422, 'Invalid course payload', parsed.error.flatten());
  }

  const payload = parsed.data;
  const created = await createCourse(
    { ...payload, slug: payload.slug || slugify(payload.title) },
    req.user?.id || null
  );

  await logActivity({
    userId: req.user?.id,
    role: req.user?.role,
    action: 'admin.course.create',
    entityType: 'course',
    entityId: String(created.id),
  });

  res.status(201).json({ success: true, data: created });
});

export const putCourse = asyncHandler(async (req, res) => {
  const courseId = Number(req.params.courseId);
  if (!courseId) throw new ApiError(400, 'Invalid course id');

  const parsed = courseSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(422, 'Invalid course payload', parsed.error.flatten());
  }

  const updated = await updateCourse(courseId, parsed.data);
  if (!updated) throw new ApiError(404, 'Course not found');

  await logActivity({
    userId: req.user?.id,
    role: req.user?.role,
    action: 'admin.course.update',
    entityType: 'course',
    entityId: String(courseId),
  });

  res.json({ success: true, data: updated });
});

export const removeCourse = asyncHandler(async (req, res) => {
  const courseId = Number(req.params.courseId);
  if (!courseId) throw new ApiError(400, 'Invalid course id');

  const removed = await deleteCourse(courseId);
  if (!removed) throw new ApiError(404, 'Course not found');

  await logActivity({
    userId: req.user?.id,
    role: req.user?.role,
    action: 'admin.course.delete',
    entityType: 'course',
    entityId: String(courseId),
  });

  res.json({ success: true, message: 'Course deleted' });
});
