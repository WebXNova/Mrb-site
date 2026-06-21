import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import { logActivity } from '../services/activityLog.service.js';
import { logImportFailed } from '../observability/lmsActionLogger.service.js';
import { logInvalidPayloadAttempt } from '../services/questionBankIntegrityLog.js';
import { importAikenQuestions, previewAikenImport } from '../services/questionImportService.js';
import { IMPORT_DUPLICATE_POLICIES } from '../services/questionImportDuplicateDetection.service.js';
import { mapDiagnosticsToStructuredErrors } from '../services/aikenImportDiagnostics.js';
import {
  findImportBatchItemsByQuestionId,
  getImportBatchById,
  listImportBatchItems,
  listImportBatches,
} from '../services/questionImportBatchItems.service.js';
import { mysqlPool } from '../config/mysql.js';
import { AIKEN_VALIDATION_LIMITS } from '../services/aikenValidator.js';
import { optionalQuestionDifficultySchema } from '../validators/questionList.schema.js';
import { MAX_QUESTION_TOPIC_LENGTH } from '../validators/questionWrite.schema.js';

/** Align with express.json 1mb limit and Aiken validator batch cap. */
const MAX_AIKEN_CONTENT_LENGTH = Math.min(
  AIKEN_VALIDATION_LIMITS.MAX_TOTAL_PAYLOAD_CHARS,
  1_000_000
);

function maxLengthMessage(field, max) {
  return `${field} must not exceed ${max} characters`;
}

/** Normalize snake_case and camelCase admin request bodies. */
function preprocessAikenImportBody(raw) {
  const obj = typeof raw === 'object' && raw !== null ? { ...raw } : {};

  if (obj.courseId != null && obj.course_id == null) obj.course_id = obj.courseId;
  if (obj.subjectId != null && obj.subject_id == null) obj.subject_id = obj.subjectId;

  delete obj.courseId;
  delete obj.subjectId;

  return obj;
}

const optionalNullableTopicSchema = z.preprocess(
  (value) => (value == null || String(value).trim() === '' ? null : String(value).trim()),
  z.union([
    z.null(),
    z.string().max(MAX_QUESTION_TOPIC_LENGTH, maxLengthMessage('topic', MAX_QUESTION_TOPIC_LENGTH)),
  ]).optional()
);

const optionalNullableSubjectIdSchema = z.preprocess(
  (value) => (value == null || value === '' ? null : value),
  z
    .union([
      z.null(),
      z.number({ invalid_type_error: 'subject_id must be a number' }).int().positive(),
    ])
    .optional()
);

const duplicatePolicySchema = z
  .enum([IMPORT_DUPLICATE_POLICIES.SKIP, IMPORT_DUPLICATE_POLICIES.WARN, IMPORT_DUPLICATE_POLICIES.ALLOW])
  .optional();

const aikenImportRequestSchema = z.preprocess(
  preprocessAikenImportBody,
  z
    .object({
      course_id: z
        .number({ invalid_type_error: 'course_id must be a number' })
        .int()
        .positive('course_id must be a positive integer'),
      subject_id: optionalNullableSubjectIdSchema,
      topic: optionalNullableTopicSchema,
      difficulty: optionalQuestionDifficultySchema,
      duplicate_policy: duplicatePolicySchema,
      marks: z
        .number({ invalid_type_error: 'marks must be a number' })
        .positive('marks must be greater than 0')
        .optional(),
      content: z
        .string({ required_error: 'content is required', invalid_type_error: 'content must be a string' })
        .trim()
        .min(1, 'content is required')
        .max(
          MAX_AIKEN_CONTENT_LENGTH,
          maxLengthMessage('content', MAX_AIKEN_CONTENT_LENGTH)
        ),
    })
    .strict()
);

const aikenPreviewRequestSchema = z.preprocess(
  preprocessAikenImportBody,
  z
    .object({
      content: z
        .string({ required_error: 'content is required', invalid_type_error: 'content must be a string' })
        .trim()
        .min(1, 'content is required')
        .max(
          MAX_AIKEN_CONTENT_LENGTH,
          maxLengthMessage('content', MAX_AIKEN_CONTENT_LENGTH)
        ),
      course_id: z
        .number({ invalid_type_error: 'course_id must be a number' })
        .int()
        .positive('course_id must be a positive integer')
        .optional(),
      subject_id: optionalNullableSubjectIdSchema,
      topic: optionalNullableTopicSchema,
      difficulty: optionalQuestionDifficultySchema,
      marks: z
        .number({ invalid_type_error: 'marks must be a number' })
        .positive('marks must be greater than 0')
        .optional(),
      duplicate_policy: duplicatePolicySchema,
    })
    .strict()
);

/**
 * POST /api/admin/questions/import/aiken/preview
 *
 * Parse + validate Aiken text for quiz-builder load (no database writes).
 * Response `imported` is the valid-question count, not a persistence count.
 */
export const previewAiken = asyncHandler(async (req, res) => {
  const parsed = aikenPreviewRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    const details = parsed.error.flatten();
    logInvalidPayloadAttempt({
      path: req.originalUrl,
      method: 'POST',
      field_errors: details.fieldErrors,
    });
    throw new ApiError(400, 'Invalid Aiken preview payload', {
      code: 'INVALID_IMPORT_PAYLOAD',
      ...details,
    });
  }

  const result = await previewAikenImport(
    parsed.data.content,
    {
      course_id: parsed.data.course_id,
      subject_id: parsed.data.subject_id ?? null,
      topic: parsed.data.topic ?? null,
      difficulty: parsed.data.difficulty ?? null,
      marks: parsed.data.marks,
      duplicate_policy: parsed.data.duplicate_policy,
    },
    { previewMode: true }
  );

  return res.status(200).json({
    success: true,
    previewOnly: true,
    imported: result.imported,
    skippedDuplicates: result.skippedDuplicates,
    failed: result.failed,
    errors: result.errors,
    structuredErrors: mapDiagnosticsToStructuredErrors(result.errors),
    skipped: result.skipped,
    duplicates: result.duplicates,
    warnings: result.warnings,
    questions: result.questions,
    diagnostics: result.diagnostics,
  });
});

/**
 * POST /api/admin/questions/import/aiken
 *
 * Admin-only Aiken import ingress. Security stack and rate limiting are applied at route level.
 */
export const importAiken = asyncHandler(async (req, res) => {
  const parsed = aikenImportRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    const details = parsed.error.flatten();
    logInvalidPayloadAttempt({
      path: req.originalUrl,
      method: 'POST',
      field_errors: details.fieldErrors,
    });
    throw new ApiError(400, 'Invalid Aiken import payload', {
      code: 'INVALID_IMPORT_PAYLOAD',
      ...details,
    });
  }

  const createdBy = Number(req.user?.id);
  if (!Number.isFinite(createdBy) || createdBy <= 0) {
    throw new ApiError(401, 'Authenticated admin required', { code: 'UNAUTHORIZED' });
  }

  let result;
  try {
    result = await importAikenQuestions({
      course_id: parsed.data.course_id,
      subject_id: parsed.data.subject_id ?? null,
      topic: parsed.data.topic ?? null,
      difficulty: parsed.data.difficulty ?? null,
      content: parsed.data.content,
      created_by: createdBy,
      file_name: req.body?.file_name ?? req.body?.fileName ?? null,
      marks: parsed.data.marks,
      duplicate_policy: parsed.data.duplicate_policy,
    });
  } catch (error) {
    logImportFailed({
      userId: createdBy,
      entityId: parsed.data.course_id,
      courseId: parsed.data.course_id,
      errorCode: error?.code || error?.errorCode || 'IMPORT_FAILED',
      message: error instanceof Error ? error.message : String(error),
      requestId: req.requestId ?? null,
    });
    throw error;
  }

  await logActivity({
    userId: createdBy,
    role: req.user?.role,
    action: 'admin.question.import.aiken',
    entityType: 'question_import_batches',
    entityId: String(result.batchId),
    metadata: {
      courseId: parsed.data.course_id,
      subjectId: parsed.data.subject_id ?? null,
      topic: parsed.data.topic ?? null,
      difficulty: parsed.data.difficulty ?? null,
      imported: result.imported,
      skippedDuplicates: result.skippedDuplicates,
      failed: result.failed,
      batchId: result.batchId,
      importedQuestionIds: result.importedQuestionIds,
    },
  });

  return res.status(200).json({
    success: result.imported > 0,
    batchId: result.batchId,
    imported: result.imported,
    skippedDuplicates: result.skippedDuplicates,
    failed: result.failed,
    errors: result.errors,
    structuredErrors: result.structuredErrors,
    skipped: result.skipped,
    warnings: result.warnings,
    importedQuestionIds: result.importedQuestionIds,
    verifiedDbCount: result.verifiedDbCount,
  });
});

function mapBatchRow(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    uploadedBy: Number(row.uploaded_by),
    uploadedByName: row.uploaded_by_name ?? null,
    uploadedByEmail: row.uploaded_by_email ?? null,
    sourceType: row.source_type,
    fileName: row.file_name,
    totalQuestions: Number(row.total_questions ?? 0),
    successfulQuestions: Number(row.successful_questions ?? 0),
    failedQuestions: Number(row.failed_questions ?? 0),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? null,
  };
}

function mapBatchItemRow(row) {
  return {
    id: Number(row.id),
    batchId: Number(row.batch_id),
    questionNumber: Number(row.question_number),
    questionTitle: row.question_title ?? null,
    questionId: row.question_id != null ? Number(row.question_id) : null,
    status: row.status,
    errorCode: row.error_code ?? null,
    message: row.error_message ?? null,
    validationLayer: row.validation_layer ?? null,
    createdAt: row.created_at,
  };
}

/**
 * GET /api/admin/questions/import/aiken/batches
 *
 * Paginated import batch history for audit and support.
 */
export const listAikenImportBatches = asyncHandler(async (req, res) => {
  const limit = Number(req.query?.limit ?? 50);
  const offset = Number(req.query?.offset ?? 0);
  const uploadedBy = req.query?.uploaded_by != null ? Number(req.query.uploaded_by) : undefined;

  const rows = await listImportBatches(mysqlPool, { limit, offset, uploadedBy });

  return res.status(200).json({
    success: true,
    batches: rows.map(mapBatchRow),
    limit: Math.min(Math.max(limit, 1), 200),
    offset: Math.max(offset, 0),
  });
});

/**
 * GET /api/admin/questions/import/aiken/batches/:batchId
 *
 * Full batch detail with per-question audit items.
 */
export const getAikenImportBatch = asyncHandler(async (req, res) => {
  const batchId = Number(req.params.batchId);
  if (!Number.isFinite(batchId) || batchId <= 0) {
    throw new ApiError(400, 'batchId must be a positive integer', { code: 'INVALID_BATCH_ID' });
  }

  const batch = await getImportBatchById(mysqlPool, batchId);
  if (!batch) {
    throw new ApiError(404, 'Import batch not found', { code: 'IMPORT_BATCH_NOT_FOUND' });
  }

  const items = await listImportBatchItems(mysqlPool, batchId);

  return res.status(200).json({
    success: true,
    batch: mapBatchRow(batch),
    items: items.map(mapBatchItemRow),
  });
});

/**
 * GET /api/admin/questions/import/aiken/questions/:questionId/batches
 *
 * Reverse lookup: which import batch(es) created a question_bank row.
 */
export const getAikenImportBatchesForQuestion = asyncHandler(async (req, res) => {
  const questionId = Number(req.params.questionId);
  if (!Number.isFinite(questionId) || questionId <= 0) {
    throw new ApiError(400, 'questionId must be a positive integer', { code: 'INVALID_QUESTION_ID' });
  }

  const rows = await findImportBatchItemsByQuestionId(mysqlPool, questionId);

  return res.status(200).json({
    success: true,
    questionId,
    items: rows.map((row) => ({
      ...mapBatchItemRow(row),
      fileName: row.file_name ?? null,
      batchUploadedBy: Number(row.uploaded_by),
      batchCreatedAt: row.batch_created_at,
    })),
  });
});
