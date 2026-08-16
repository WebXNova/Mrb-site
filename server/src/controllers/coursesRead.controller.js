import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import { sendSuccess } from '../utils/httpEnvelope.js';
import { toCourseAdminDto, toCoursePublicDto } from '../dto/course.dto.js';
import { getCourseRowById, listActiveCourseRows, listAllCourseRows } from '../services/courseCatalogQueries.service.js';
import { listPublicSubjectsForCourse } from '../services/subject.service.js';
import {
  listPublicActiveCourseCategories,
  loadCategoriesByCourseIds,
} from '../services/courseCategories.service.js';
import { parsePublicCatalogCategoryId } from '../validators/publicCatalogCategory.schema.js';

function invalidCourseId() {
  return new ApiError(400, 'Invalid course id', { code: 'INVALID_COURSE_ID' });
}

export const getPublicCourseCategories = asyncHandler(async (_req, res) => {
  const categories = await listPublicActiveCourseCategories();
  sendSuccess(res, { categories });
});

export const getCoursesPublic = asyncHandler(async (req, res) => {
  try {
    const categoryId = parsePublicCatalogCategoryId(req.query);
    const rows = await listActiveCourseRows({ categoryId });
    sendSuccess(res, rows.map((r) => toCoursePublicDto(r)).filter(Boolean));
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(503, 'Course catalog is temporarily unavailable', {
      code: 'CATALOG_UNAVAILABLE',
      metadata: { reason: error instanceof Error ? error.message : String(error) },
    });
  }
});

export const getCoursesAdminRead = asyncHandler(async (_req, res) => {
  const rows = await listAllCourseRows();
  let categoriesByCourse = new Map();
  try {
    categoriesByCourse = await loadCategoriesByCourseIds(rows.map((r) => r.id));
  } catch {
    /* schema may not exist in partial deploys — list still works without categories */
  }
  sendSuccess(
    res,
    rows
      .map((r) => {
        const dto = toCourseAdminDto(r);
        if (!dto) return null;
        const categories = categoriesByCourse.get(Number(r.id)) ?? [];
        return {
          ...dto,
          categories,
          category_ids: categories.map((c) => c.id),
        };
      })
      .filter(Boolean)
  );
});

export const getCoursePublicById = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) throw invalidCourseId();

  const row = await getCourseRowById(id, { activeOnly: true });
  if (!row) throw new ApiError(404, 'Course not found', { code: 'COURSE_NOT_FOUND' });

  const dto = toCoursePublicDto(row);
  let categories = [];
  try {
    const categoriesByCourse = await loadCategoriesByCourseIds([id]);
    categories = (categoriesByCourse.get(id) ?? [])
      .filter((c) => c.isActive !== false)
      .map((c) => ({
        id: c.id,
        name: c.name,
        class_level: c.classLevel,
        department: c.department,
        board: c.board,
      }));
  } catch {
    /* schema may not exist in partial deploys — detail still works without categories */
  }

  sendSuccess(res, {
    ...dto,
    categories,
    category_ids: categories.map((c) => c.id),
  });
});

export const getPublicCourseSubjects = asyncHandler(async (req, res) => {
  const id = Number(req.params.courseId);
  if (!Number.isFinite(id) || id <= 0) throw invalidCourseId();
  const data = await listPublicSubjectsForCourse(id);
  sendSuccess(res, data);
});
