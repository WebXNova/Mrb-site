import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import { sendSuccess } from '../utils/httpEnvelope.js';
import { logActivity } from '../services/activityLog.service.js';
import {
  getAdminPricingForCourse,
  upsertActiveCoursePricing,
} from '../services/coursePricing.service.js';
import { coursePricingWriteBodySchema } from '../validators/coursePricing.schema.js';

function invalidCourseId() {
  return new ApiError(400, 'Invalid course id', { code: 'INVALID_COURSE_ID' });
}

function parseCourseId(req) {
  const id = Number(req.params.courseId);
  if (!Number.isFinite(id) || id <= 0) return null;
  return id;
}

export const getCoursePricing = asyncHandler(async (req, res) => {
  const courseId = parseCourseId(req);
  if (!courseId) throw invalidCourseId();
  const data = await getAdminPricingForCourse(courseId);
  sendSuccess(res, data);
});

export const putCoursePricing = asyncHandler(async (req, res) => {
  const courseId = parseCourseId(req);
  if (!courseId) throw invalidCourseId();

  const parsed = coursePricingWriteBodySchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(422, 'Invalid pricing payload', parsed.error.flatten());
  }

  const saved = await upsertActiveCoursePricing(courseId, parsed.data, req.user?.id || null);

  await logActivity({
    userId: req.user?.id,
    role: req.user?.role,
    action: 'admin.course_pricing.update',
    entityType: 'course_pricing',
    entityId: String(courseId),
    metadata: {
      courseId,
      pricing_type: saved?.type ?? null,
      currency: saved?.currency ?? null,
      is_active: saved?.is_active ?? null,
    },
  });

  sendSuccess(res, saved);
});
