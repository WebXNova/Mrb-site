import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import {
  deactivateCourse,
  createCourse,
  deleteCourse,
  updateCourse,
} from '../services/course.service.js';
import { countLecturesForCourse } from '../services/lecture.service.js';
import { logActivity } from '../services/activityLog.service.js';
import { courseWriteBodySchema } from '../validators/courseWrite.schema.js';
import { sendSuccess } from '../utils/httpEnvelope.js';

function invalidCourseId() {
  return new ApiError(400, 'Invalid course id', { code: 'INVALID_COURSE_ID' });
}

export const postCourse = asyncHandler(async (req, res) => {
  const parsed = courseWriteBodySchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(422, 'Invalid course payload', parsed.error.flatten());
  }

  const p = parsed.data;
  const created = await createCourse(
    {
      title: p.title,
      description: p.description,
      short_description: p.short_description ?? null,
      level: p.level,
      thumbnail_url: p.thumbnail_url ?? null,
      is_active: p.is_active ?? true,
    },
    req.user?.id || null
  );

  await logActivity({
    userId: req.user?.id,
    role: req.user?.role,
    action: 'admin.course.create',
    entityType: 'course',
    entityId: String(created.id),
  });

  sendSuccess(res, created, 201);
});

export const putCourse = asyncHandler(async (req, res) => {
  const courseId = Number(req.params.courseId);
  if (!courseId) throw invalidCourseId();

  const parsed = courseWriteBodySchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(422, 'Invalid course payload', parsed.error.flatten());
  }

  const p = parsed.data;
  const updated = await updateCourse(courseId, {
    title: p.title,
    description: p.description,
    short_description: p.short_description,
    level: p.level,
    thumbnail_url: p.thumbnail_url,
    is_active: p.is_active,
  });

  await logActivity({
    userId: req.user?.id,
    role: req.user?.role,
    action: 'admin.course.update',
    entityType: 'course',
    entityId: String(courseId),
  });

  sendSuccess(res, updated);
});

/**
 * Default: archive (soft) — set `is_active = false`. Lectures remain attached.
 * `?purge=true`: hard delete (super_admin only). If lectures exist, returns 409 unless `forceCascade=true`.
 */
export const removeCourse = asyncHandler(async (req, res) => {
  const courseId = Number(req.params.courseId);
  if (!courseId) throw invalidCourseId();

  const purge = String(req.query.purge || '') === 'true';
  const forceCascade = String(req.query.forceCascade || '') === 'true';

  if (purge) {
    if (req.user?.role !== 'super_admin') {
      throw new ApiError(403, 'Permanent course deletion requires super_admin');
    }
    const lectureCount = await countLecturesForCourse(courseId);
    if (lectureCount > 0 && !forceCascade) {
      throw new ApiError(
        409,
        `This course has ${lectureCount} lecture(s). Archive it, reassign lectures, or request purge with forceCascade=true (super_admin) to delete the course and its lectures.`,
        { lectureCount }
      );
    }
    const purged = await deleteCourse(courseId);
    if (!purged) throw new ApiError(404, 'Course not found', { code: 'COURSE_NOT_FOUND' });

    await logActivity({
      userId: req.user?.id,
      role: req.user?.role,
      action: 'admin.course.purge',
      entityType: 'course',
      entityId: String(courseId),
    });

    sendSuccess(res, {
      message: 'Course permanently deleted',
      purged: true,
      lectureCountCascaded: lectureCount > 0 ? lectureCount : 0,
    });
    return;
  }

  const archived = await deactivateCourse(courseId);
  if (!archived) throw new ApiError(404, 'Course not found', { code: 'COURSE_NOT_FOUND' });

  await logActivity({
    userId: req.user?.id,
    role: req.user?.role,
    action: 'admin.course.archive',
    entityType: 'course',
    entityId: String(courseId),
  });

  sendSuccess(res, {
    message: 'Course archived (hidden from catalog). Lectures are unchanged.',
    archived: true,
    courseId,
  });
});
