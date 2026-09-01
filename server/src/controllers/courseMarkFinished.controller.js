import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import { sendSuccess } from '../utils/httpEnvelope.js';
import { courseMarkFinishedBodySchema } from '../validators/courseMarkFinished.schema.js';
import { getCourseFinishPreview, markCourseFinished } from '../services/courseMarkFinished.service.js';

function invalidCourseId() {
  return new ApiError(400, 'Invalid course id', { code: 'INVALID_COURSE_ID' });
}

export const getCourseFinishPreviewHandler = asyncHandler(async (req, res) => {
  const courseId = Number(req.params.courseId);
  if (!courseId) throw invalidCourseId();
  const preview = await getCourseFinishPreview(courseId);
  sendSuccess(res, preview);
});

export const postMarkCourseFinished = asyncHandler(async (req, res) => {
  const courseId = Number(req.params.courseId);
  if (!courseId) throw invalidCourseId();

  const parsed = courseMarkFinishedBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    throw new ApiError(400, 'This action requires confirm: true', {
      code: 'CONFIRMATION_REQUIRED',
      details: parsed.error.flatten(),
    });
  }

  const result = await markCourseFinished(courseId, {
    confirm: parsed.data.confirm,
    actor: { id: req.user?.id, role: req.user?.role },
  });

  sendSuccess(res, {
    message: 'Course marked finished',
    ...result,
  });
});
