import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import { sendSuccess } from '../utils/httpEnvelope.js';
import { logActivity } from '../services/activityLog.service.js';
import {
  bulkAssignQuestionsToTest,
  bulkDeleteQuestions,
  bulkExportQuestions,
} from '../services/questionBulk.service.js';
import {
  questionBulkAssignTestBodySchema,
  questionBulkDeleteBodySchema,
  questionBulkExportBodySchema,
} from '../validators/questionBulk.schema.js';

const LOG_PREFIX = '[question-bank]';

function readAdminContext(req) {
  const adminId = Number(req.user?.id);
  if (!Number.isFinite(adminId) || adminId <= 0) {
    throw new ApiError(401, 'Authenticated admin required', { code: 'UNAUTHORIZED' });
  }
  return {
    adminId,
    role: String(req.user?.role || 'admin'),
  };
}

export const postBulkDeleteQuestions = asyncHandler(async (req, res) => {
  const parsed = questionBulkDeleteBodySchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(422, 'Invalid bulk delete payload', parsed.error.flatten());
  }

  const { adminId, role } = readAdminContext(req);
  const result = await bulkDeleteQuestions(parsed.data.question_ids, adminId, role);

  try {
    await logActivity({
      userId: adminId,
      role,
      action: 'admin.question.bulk_delete',
      entityType: 'question_bank',
      metadata: {
        deleted_count: result.deleted_count,
        failed_count: result.failed_count,
      },
    });
  } catch {
    // Non-blocking audit.
  }

  console.info(`${LOG_PREFIX} bulk delete handler completed`, result);
  sendSuccess(res, result);
});

export const postBulkExportQuestions = asyncHandler(async (req, res) => {
  const parsed = questionBulkExportBodySchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(422, 'Invalid bulk export payload', parsed.error.flatten());
  }

  readAdminContext(req);
  const result = await bulkExportQuestions(parsed.data.question_ids);

  console.info(`${LOG_PREFIX} bulk export handler completed`, {
    exported_count: result.exported_count,
  });
  sendSuccess(res, result);
});

export const postBulkAssignQuestionsToTest = asyncHandler(async (req, res) => {
  const parsed = questionBulkAssignTestBodySchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(422, 'Invalid bulk assign payload', parsed.error.flatten());
  }

  const { adminId, role } = readAdminContext(req);
  const result = await bulkAssignQuestionsToTest(
    parsed.data.question_ids,
    parsed.data.test_id,
    adminId,
    role
  );

  try {
    await logActivity({
      userId: adminId,
      role,
      action: 'admin.question.bulk_assign_test',
      entityType: 'question_bank',
      entityId: String(parsed.data.test_id),
      metadata: {
        assigned_count: result.assigned_count,
        already_linked_count: result.already_linked_count,
      },
    });
  } catch {
    // Non-blocking audit.
  }

  console.info(`${LOG_PREFIX} bulk assign handler completed`, {
    test_id: result.test_id,
    assigned_count: result.assigned_count,
  });
  sendSuccess(res, result);
});
