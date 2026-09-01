import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import { sendSuccess } from '../utils/httpEnvelope.js';
import { requireEntitlement } from '../security/cee/requireEntitlement.js';
import { assertStudentIdentity } from '../security/cee/identityGuard.js';
import {
  getAdminCourseLeaderboard,
  getAdminStudentCourseDetail,
  getStudentCourseLeaderboard,
  getStudentCurrentCourseLeaderboard,
} from '../services/courseLeaderboard.service.js';

function parsePositiveInt(raw, message, code) {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ApiError(400, message, { code });
  }
  return id;
}

function noStore(res) {
  res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
}

/**
 * GET /api/student/leaderboard
 * Current running course only — resolved from active enrollment, not a client course id.
 */
export const getStudentCurrentLeaderboardHandler = asyncHandler(async (req, res) => {
  const userId = Number(req.user?.id);
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new ApiError(401, 'Authentication required', { code: 'AUTH_REQUIRED' });
  }
  const payload = await getStudentCurrentCourseLeaderboard(userId);
  noStore(res);
  sendSuccess(res, payload);
});

/**
 * GET /api/courses/:courseId/leaderboard
 * Verified student with active enrollment in this course. Masked names only.
 */
export const getStudentCourseLeaderboardHandler = asyncHandler(async (req, res) => {
  await assertStudentIdentity(req, res, { requireVerified: true });
  const courseId = parsePositiveInt(req.params.courseId, 'Invalid course id', 'INVALID_COURSE_ID');
  const userId = Number(req.user?.id);
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new ApiError(401, 'Authentication required', { code: 'AUTH_REQUIRED' });
  }
  await requireEntitlement(userId, { courseId });
  const payload = await getStudentCourseLeaderboard(courseId, userId);
  noStore(res);
  sendSuccess(res, payload);
});

/**
 * GET /admin/courses/:courseId/leaderboard
 */
export const getAdminCourseLeaderboardHandler = asyncHandler(async (req, res) => {
  const courseId = parsePositiveInt(req.params.courseId, 'Invalid course id', 'INVALID_COURSE_ID');
  const payload = await getAdminCourseLeaderboard(courseId, req.user?.id);
  noStore(res);
  sendSuccess(res, payload);
});

/**
 * GET /admin/students/:studentId/course/:courseId/detail
 */
export const getAdminStudentCourseDetailHandler = asyncHandler(async (req, res) => {
  const studentId = parsePositiveInt(req.params.studentId, 'Invalid student id', 'INVALID_STUDENT_ID');
  const courseId = parsePositiveInt(req.params.courseId, 'Invalid course id', 'INVALID_COURSE_ID');
  const payload = await getAdminStudentCourseDetail(studentId, courseId, req.user?.id);
  noStore(res);
  sendSuccess(res, payload);
});
