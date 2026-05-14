import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import { sendSuccess } from '../utils/httpEnvelope.js';
import { courseWizardBodySchema } from '../validators/courseWizard.schema.js';
import { createCourseWizardTransaction } from '../services/courseWizard.service.js';
import { logActivity } from '../services/activityLog.service.js';

export const postCourseWizard = asyncHandler(async (req, res) => {
  const parsed = courseWizardBodySchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(422, 'Invalid wizard payload', parsed.error.flatten());
  }

  const created = await createCourseWizardTransaction(parsed.data, req.user?.id || null);

  await logActivity({
    userId: req.user?.id,
    role: req.user?.role,
    action: parsed.data.publish ? 'admin.course.wizard.publish' : 'admin.course.wizard.draft',
    entityType: 'course',
    entityId: String(created.id),
    metadata: {
      batches: parsed.data.batches.length,
      subjects: parsed.data.subjects.length,
    },
  });

  sendSuccess(res, created, 201);
});
