import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import { sendSuccess } from '../utils/httpEnvelope.js';
import { logActivity } from '../services/activityLog.service.js';
import { getCourseRowById } from '../services/courseCatalogQueries.service.js';
import { updateCourse, deactivateCourse } from '../services/course.service.js';
import { toCourseAdminDto } from '../dto/course.dto.js';

function invalidCourseId() {
  return new ApiError(400, 'Invalid course id', { code: 'INVALID_COURSE_ID' });
}

/**
 * POST /api/admin/courses/:courseId/publish
 * Transition a course from draft → published.
 * Validates that the course has required fields before publishing.
 */
export const publishCourse = asyncHandler(async (req, res) => {
  const courseId = Number(req.params.courseId);
  if (!courseId) throw invalidCourseId();

  const row = await getCourseRowById(courseId);
  if (!row) throw new ApiError(404, 'Course not found', { code: 'COURSE_NOT_FOUND' });

  const currentStatus = String(row.status || '').toLowerCase();
  if (currentStatus === 'published') {
    sendSuccess(res, { message: 'Course is already published' });
    return;
  }
  if (currentStatus === 'archived') {
    throw new ApiError(409, 'Archived courses cannot be published directly. Restore to draft first.', {
      code: 'COURSE_ARCHIVED',
    });
  }

  // Validate required fields for publishing
  const errors = [];
  if (!row.title || String(row.title).trim().length < 3) {
    errors.push({ field: 'title', message: 'Course title must be at least 3 characters' });
  }
  if (!row.description || String(row.description).trim().length < 30) {
    errors.push({ field: 'description', message: 'Course description must be at least 30 characters' });
  }
  if (!row.image_url || String(row.image_url).trim() === '') {
    errors.push({ field: 'thumbnail_url', message: 'Course thumbnail is required' });
  }

  if (errors.length > 0) {
    throw new ApiError(422, 'Course does not meet publish requirements', {
      code: 'PUBLISH_VALIDATION_FAILED',
      validationErrors: errors,
    });
  }

  const updated = await updateCourse(courseId, {
    title: row.title,
    description: row.description,
    status: 'published',
    is_active: true,
  });

  await logActivity({
    userId: req.user?.id,
    role: req.user?.role,
    action: 'admin.course.publish',
    entityType: 'course',
    entityId: String(courseId),
    metadata: { previousStatus: currentStatus },
  });

  sendSuccess(res, { message: 'Course published successfully', course: updated });
});

/**
 * POST /api/admin/courses/:courseId/archive
 * Transition a course from published → archived.
 * Makes the course read-only and hidden from user-facing views.
 */
export const archiveCourse = asyncHandler(async (req, res) => {
  const courseId = Number(req.params.courseId);
  if (!courseId) throw invalidCourseId();

  const row = await getCourseRowById(courseId);
  if (!row) throw new ApiError(404, 'Course not found', { code: 'COURSE_NOT_FOUND' });

  const currentStatus = String(row.status || '').toLowerCase();
  if (currentStatus === 'archived') {
    sendSuccess(res, { message: 'Course is already archived' });
    return;
  }
  if (currentStatus === 'draft') {
    // Allow drafting a course directly to archived
    const archived = await deactivateCourse(courseId);
    if (!archived) throw new ApiError(404, 'Course not found', { code: 'COURSE_NOT_FOUND' });

    await logActivity({
      userId: req.user?.id,
      role: req.user?.role,
      action: 'admin.course.archive',
      entityType: 'course',
      entityId: String(courseId),
      metadata: { previousStatus: currentStatus },
    });

    sendSuccess(res, { message: 'Course archived', courseId });
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
    metadata: { previousStatus: currentStatus },
  });

  sendSuccess(res, { message: 'Course archived and hidden from catalog', courseId });
});

/**
 * POST /api/admin/courses/:courseId/unarchive
 * Transition a course from archived → draft.
 * Restores editability.
 */
export const unarchiveCourse = asyncHandler(async (req, res) => {
  const courseId = Number(req.params.courseId);
  if (!courseId) throw invalidCourseId();

  const row = await getCourseRowById(courseId);
  if (!row) throw new ApiError(404, 'Course not found', { code: 'COURSE_NOT_FOUND' });

  const currentStatus = String(row.status || '').toLowerCase();
  if (currentStatus !== 'archived') {
    throw new ApiError(409, 'Only archived courses can be unarchived', {
      code: 'COURSE_NOT_ARCHIVED',
    });
  }

  const updated = await updateCourse(courseId, {
    title: row.title,
    description: row.description,
    status: 'draft',
    is_active: false,
  });

  await logActivity({
    userId: req.user?.id,
    role: req.user?.role,
    action: 'admin.course.unarchive',
    entityType: 'course',
    entityId: String(courseId),
    metadata: { previousStatus: currentStatus },
  });

  sendSuccess(res, { message: 'Course restored to draft', course: updated });
});
