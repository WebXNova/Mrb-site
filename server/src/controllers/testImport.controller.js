import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import { sendSuccess } from '../utils/httpEnvelope.js';
import { logActivity } from '../services/activityLog.service.js';
import {
  logTestImportCompleted,
  logTestImportFailed,
  logTestImportStarted,
} from '../observability/lmsActionLogger.service.js';
import {
  confirmTestImport,
  previewTestImport,
  validateTestImport,
} from '../services/testImport.service.js';

const formatSchema = z.enum(['json', 'csv', 'zip', 'auto']).optional();

function preprocessImportBody(raw) {
  const obj = typeof raw === 'object' && raw !== null ? { ...raw } : {};
  if (obj.courseId != null && obj.course_id == null) obj.course_id = obj.courseId;
  if (obj.fileName != null && obj.file_name == null) obj.file_name = obj.fileName;
  delete obj.courseId;
  delete obj.fileName;
  return obj;
}

const importRequestSchema = z.preprocess(
  preprocessImportBody,
  z.object({
    course_id: z.number().int().positive(),
    content: z.string().min(1, 'File content is required.'),
    format: formatSchema,
    file_name: z.string().max(255).nullable().optional(),
    confirm: z.boolean().optional(),
  })
);

/**
 * POST /tests/import/validate — Step 2: structure validation
 */
export const postTestImportValidate = asyncHandler(async (req, res) => {
  const parsed = importRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(422, 'Invalid import validate request.', {
      code: 'VALIDATION_ERROR',
      details: parsed.error.flatten(),
    });
  }

  const result = await validateTestImport(parsed.data);
  sendSuccess(res, result);
});

/**
 * POST /tests/import/preview — Step 3: preview summary
 */
export const postTestImportPreview = asyncHandler(async (req, res) => {
  const parsed = importRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(422, 'Invalid import preview request.', {
      code: 'VALIDATION_ERROR',
      details: parsed.error.flatten(),
    });
  }

  const result = await previewTestImport(parsed.data);
  sendSuccess(res, result);
});

/**
 * POST /tests/import/confirm — Step 4+5: atomic import
 */
export const postTestImportConfirm = asyncHandler(async (req, res) => {
  const parsed = importRequestSchema.safeParse({ ...req.body, confirm: true });
  if (!parsed.success) {
    throw new ApiError(422, 'Invalid import confirm request.', {
      code: 'VALIDATION_ERROR',
      details: parsed.error.flatten(),
    });
  }

  const userId = req.user?.id;
  const role = req.user?.role ?? 'admin';

  if (!userId) {
    throw new ApiError(401, 'Authenticated admin required', { code: 'UNAUTHORIZED' });
  }

  logTestImportStarted({
    userId,
    role,
    courseId: parsed.data.course_id,
    fileName: parsed.data.file_name ?? null,
    format: parsed.data.format ?? 'auto',
  });

  try {
    const result = await confirmTestImport({ ...parsed.data, confirm: true }, userId, role);

    logTestImportCompleted({
      userId,
      role,
      batchId: result.batch_id,
      testId: result.test_id,
      courseId: result.course_id,
      questionCount: result.question_count,
      format: result.format,
    });

    await logActivity({
      userId,
      role,
      action: 'admin.test.import',
      entityType: 'test',
      entityId: String(result.test_id),
      metadata: {
        batchId: result.batch_id,
        courseId: result.course_id,
        questionCount: result.question_count,
        format: result.format,
        fileName: parsed.data.file_name ?? null,
      },
    });

    sendSuccess(res, result, 201);
  } catch (error) {
    logTestImportFailed({
      userId,
      role,
      courseId: parsed.data.course_id,
      code: error?.code ?? null,
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
});

/** Legacy alias */
export const postRichContentTestImportPreview = postTestImportPreview;
export const postRichContentTestImport = postTestImportConfirm;
