import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import { sendSuccess } from '../utils/httpEnvelope.js';
import { resolveRequestEntitlement } from '../security/cee/requireEntitlement.js';
import {
  buildCourseProgressSummary,
  markLectureComplete,
} from '../services/lectureProgress.service.js';

export const postLectureComplete = asyncHandler(async (req, res) => {
  const studentId = Number(req.user?.id);
  if (!Number.isInteger(studentId) || studentId <= 0) {
    throw new ApiError(401, 'Authentication required', { code: 'AUTH_REQUIRED' });
  }

  const lectureId = Number(req.params.lectureId);
  if (!Number.isInteger(lectureId) || lectureId <= 0) {
    throw new ApiError(400, 'Invalid lecture id', { code: 'INVALID_LECTURE_ID' });
  }

  const entitlement = resolveRequestEntitlement(req);
  if (!entitlement?.courseId) {
    throw new ApiError(403, 'No active enrollment was found for your account.', {
      code: 'ENROLLMENT_NOT_FOUND',
    });
  }

  const completion = await markLectureComplete(studentId, lectureId, entitlement.courseId);
  const progress = await buildCourseProgressSummary(studentId, entitlement.courseId);

  sendSuccess(res, { completion, progress }, completion.created ? 201 : 200);
});

export const getCourseProgress = asyncHandler(async (req, res) => {
  const studentId = Number(req.user?.id);
  if (!Number.isInteger(studentId) || studentId <= 0) {
    throw new ApiError(401, 'Authentication required', { code: 'AUTH_REQUIRED' });
  }

  const courseId = Number(req.params.courseId);
  if (!Number.isInteger(courseId) || courseId <= 0) {
    throw new ApiError(400, 'Invalid course id', { code: 'INVALID_COURSE_ID' });
  }

  const entitlement = resolveRequestEntitlement(req);
  if (!entitlement?.courseId) {
    throw new ApiError(403, 'No active enrollment was found for your account.', {
      code: 'ENROLLMENT_NOT_FOUND',
    });
  }

  if (Number(entitlement.courseId) !== courseId) {
    throw new ApiError(403, 'Course access mismatch.', { code: 'COURSE_ACCESS_MISMATCH' });
  }

  const progress = await buildCourseProgressSummary(studentId, courseId);
  sendSuccess(res, progress);
});
