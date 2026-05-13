import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import { sendSuccess } from '../utils/httpEnvelope.js';
import { toCourseAdminDto, toCoursePublicDto } from '../dto/course.dto.js';
import { getCourseRowById, listActiveCourseRows, listAllCourseRows } from '../services/courseCatalogQueries.service.js';

function invalidCourseId() {
  return new ApiError(400, 'Invalid course id', { code: 'INVALID_COURSE_ID' });
}

export const getCoursesPublic = asyncHandler(async (_req, res) => {
  const rows = await listActiveCourseRows();
  sendSuccess(res, rows.map((r) => toCoursePublicDto(r)));
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
