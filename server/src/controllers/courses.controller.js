import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import {
  deactivateCourse,
  createCourse,
  deleteCourse,
  updateCourse,
} from '../services/course.service.js';
import { logActivity } from '../services/activityLog.service.js';
import { courseCreateBodySchema, courseWriteBodySchema } from '../validators/courseWrite.schema.js';
import { sendSuccess } from '../utils/httpEnvelope.js';
import { isAdminRole } from '../utils/isAdminRole.js';

function invalidCourseId() {
  return new ApiError(400, 'Invalid course id', { code: 'INVALID_COURSE_ID' });
}

export const postCourse = asyncHandler(async (req, res) => {
  const parsed = courseCreateBodySchema.safeParse(req.body);
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
      is_active: false,
      status: 'draft',
      start_date: p.start_date ?? null,
      end_date: p.end_date ?? null,
      admission_status: p.admission_status,
    },
    req.user?.id || null,
    { pricing: p.pricing ?? null, curriculumSeeds: p.subjects }
  );

  await logActivity({
    userId: req.user?.id,
    role: req.user?.role,
    action: 'admin.course.create',
    entityType: 'course',
    entityId: String(created.id),
    metadata: {
      pricing_provided: !!p.pricing,
      initial_curriculum_rows: Array.isArray(p.subjects) ? p.subjects.length : 0,
    },
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
    status: p.status,
    start_date: p.start_date,
    end_date: p.end_date,
    admission_status: p.admission_status,
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
 * `?purge=true`: permanent delete with explicit content cascade and enrollment safety checks.
 */
export const removeCourse = asyncHandler(async (req, res) => {
  const courseId = Number(req.params.courseId);
  if (!courseId) throw invalidCourseId();

  const purge = String(req.query.purge || '') === 'true';

  if (purge) {
    if (!isAdminRole(req.user?.role)) {
      throw new ApiError(403, 'Permanent course deletion requires an admin session');
    }

    const result = await deleteCourse(courseId);
    if (!result.deleted) throw new ApiError(404, 'Course not found', { code: 'COURSE_NOT_FOUND' });

    await logActivity({
      userId: req.user?.id,
      role: req.user?.role,
      action: 'admin.course.purge',
      entityType: 'course',
      entityId: String(courseId),
      metadata: result.cascaded ?? {},
    });

    sendSuccess(res, {
      message: 'Course permanently deleted',
      purged: true,
      courseId,
      cascaded: result.cascaded ?? {},
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
