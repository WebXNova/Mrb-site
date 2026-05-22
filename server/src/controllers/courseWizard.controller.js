import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import { sendSuccess } from '../utils/httpEnvelope.js';
import { courseWizardBodySchema } from '../validators/courseWizard.schema.js';
import { createCourseWizardTransaction } from '../services/courseWizard.service.js';
import { logActivity } from '../services/activityLog.service.js';
import { StructuredLogger } from '../utils/requestId.js';
import { validatePublishRequirements } from '../services/coursePublishValidation.service.js';

export const postCourseWizard = asyncHandler(async (req, res) => {
  const requestId = req.requestId || 'unknown';
  const logger = new StructuredLogger({ requestId, endpoint: '/api/admin/courses/wizard' });

  logger.info('Course wizard request received', {
    userId: req.user?.id,
    publish: req.body?.publish,
    batchCount: req.body?.batches?.length,
    subjectCount: req.body?.subjects?.length,
  });

  const parsed = courseWizardBodySchema.safeParse(req.body);
  if (!parsed.success) {
    logger.error('Wizard validation failed', {
      errors: parsed.error.flatten(),
    });
    throw new ApiError(422, 'Invalid wizard payload', parsed.error.flatten());
  }

  // Additional publish validation if publishing
  if (parsed.data.publish) {
    logger.debug('Validating publish requirements');
    validatePublishRequirements(parsed.data);
  }

  try {
    const created = await createCourseWizardTransaction(parsed.data, req.user?.id || null, { requestId });

    logger.info('Course wizard created successfully', {
      courseId: created.id,
      publish: parsed.data.publish,
    });

    await logActivity({
      userId: req.user?.id,
      role: req.user?.role,
      action: parsed.data.publish ? 'admin.course.wizard.publish' : 'admin.course.wizard.draft',
      entityType: 'course',
      entityId: String(created.id),
      metadata: {
        batches: parsed.data.batches.length,
        subjects: parsed.data.subjects.length,
        requestId,
      },
    });

    sendSuccess(res, created, 201);
  } catch (error) {
    // Preserve granular error codes, don't collapse to generic COURSE_CONFLICT
    if (error instanceof ApiError) {
      logger.error('Course wizard failed', {
        code: error.details?.code,
        message: error.message,
        statusCode: error.statusCode,
      });
      throw error;
    }
    
    logger.error('Course wizard unexpected error', {
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
});
