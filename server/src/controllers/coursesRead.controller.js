import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import { sendSuccess } from '../utils/httpEnvelope.js';
import { toCourseAdminDto, toCoursePublicDto } from '../dto/course.dto.js';
import { getCourseRowById, listActiveCourseRows, listAllCourseRows } from '../services/courseCatalogQueries.service.js';
import { listPublicSubjectsForCourse } from '../services/subject.service.js';

function invalidCourseId() {
  return new ApiError(400, 'Invalid course id', { code: 'INVALID_COURSE_ID' });
}

export const getCoursesPublic = asyncHandler(async (_req, res) => {
  try {
    const rows = await listActiveCourseRows();
    sendSuccess(res, rows.map((r) => toCoursePublicDto(r)).filter(Boolean));
  } catch (error) {
    throw new ApiError(503, 'Course catalog is temporarily unavailable', {
      code: 'CATALOG_UNAVAILABLE',
      metadata: { reason: error instanceof Error ? error.message : String(error) },
    });
  }
});

export const getCoursesAdminRead = asyncHandler(async (_req, res) => {
  const rows = await listAllCourseRows();
  sendSuccess(res, rows.map((r) => toCourseAdminDto(r)));
});

export const getCoursePublicById = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) throw invalidCourseId();

  const row = await getCourseRowById(id, { activeOnly: true });
  if (!row) throw new ApiError(404, 'Course not found', { code: 'COURSE_NOT_FOUND' });

  sendSuccess(res, toCoursePublicDto(row));
});

export const getPublicCourseSubjects = asyncHandler(async (req, res) => {
  const id = Number(req.params.courseId);
  if (!Number.isFinite(id) || id <= 0) throw invalidCourseId();
  const data = await listPublicSubjectsForCourse(id);
  sendSuccess(res, data);
});
