import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import { sendSuccess } from '../utils/httpEnvelope.js';
import {
  activateCourseCategory,
  createCourseCategory,
  deactivateCourseCategory,
  listCourseCategories,
  reorderCourseCategories,
  updateCourseCategory,
} from '../services/courseCategories.service.js';

function parseActorId(req) {
  const userId = Number(req.user?.id);
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new ApiError(401, 'Authentication required');
  }
  return userId;
}

function parseCategoryIdParam(req) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ApiError(400, 'Invalid category id');
  }
  return id;
}

function parseActorRole(req) {
  return typeof req.user?.role === 'string' ? req.user.role : 'admin';
}

export const getCourseCategories = asyncHandler(async (_req, res) => {
  const categories = await listCourseCategories();
  sendSuccess(res, { categories, canWrite: true });
});

export const postCourseCategory = asyncHandler(async (req, res) => {
  const actorId = parseActorId(req);
  const category = await createCourseCategory({
    body: req.body,
    actorId,
    actorRole: parseActorRole(req),
  });
  sendSuccess(res, { category }, 201);
});

export const putCourseCategory = asyncHandler(async (req, res) => {
  const actorId = parseActorId(req);
  const categoryId = parseCategoryIdParam(req);
  const category = await updateCourseCategory({
    categoryId,
    body: req.body,
    actorId,
    actorRole: parseActorRole(req),
  });
  sendSuccess(res, { category });
});

export const putCourseCategoryActivate = asyncHandler(async (req, res) => {
  const actorId = parseActorId(req);
  const categoryId = parseCategoryIdParam(req);
  const category = await activateCourseCategory({
    categoryId,
    actorId,
    actorRole: parseActorRole(req),
  });
  sendSuccess(res, { category });
});

export const putCourseCategoryDeactivate = asyncHandler(async (req, res) => {
  const actorId = parseActorId(req);
  const categoryId = parseCategoryIdParam(req);
  const category = await deactivateCourseCategory({
    categoryId,
    actorId,
    actorRole: parseActorRole(req),
  });
  sendSuccess(res, { category });
});

export const putCourseCategoriesReorder = asyncHandler(async (req, res) => {
  const actorId = parseActorId(req);
  const categories = await reorderCourseCategories({
    body: req.body,
    actorId,
    actorRole: parseActorRole(req),
  });
  sendSuccess(res, { categories });
});
