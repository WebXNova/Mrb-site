import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import { sendSuccess } from '../utils/httpEnvelope.js';
import {
  listCategoriesForCourse,
  replaceCourseCategories,
} from '../services/courseCategoryMap.service.js';

function parseActorId(req) {
  const userId = Number(req.user?.id);
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new ApiError(401, 'Authentication required');
  }
  return userId;
}

function parseCourseIdParam(req) {
  const id = Number(req.params.courseId ?? req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ApiError(400, 'Invalid course id', { code: 'INVALID_COURSE_ID' });
  }
  return id;
}

function parseActorRole(req) {
  return typeof req.user?.role === 'string' ? req.user.role : 'admin';
}

export const getCourseCategoryAssignments = asyncHandler(async (req, res) => {
  const courseId = parseCourseIdParam(req);
  const categories = await listCategoriesForCourse(courseId);
  sendSuccess(res, { categories });
});

export const putCourseCategoryAssignments = asyncHandler(async (req, res) => {
  const actorId = parseActorId(req);
  const courseId = parseCourseIdParam(req);
  const categories = await replaceCourseCategories({
    courseId,
    body: req.body,
    actorId,
    actorRole: parseActorRole(req),
  });
  sendSuccess(res, { categories });
});
