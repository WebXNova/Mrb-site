import { mysqlPool } from '../config/mysql.js';
import { ApiError } from '../utils/apiError.js';
import { getCourseRowById } from './courseCatalogQueries.service.js';
import { createQuestionFromPreparedPayload } from './createQuestion.service.js';
import { parseAikenDocument } from './aikenParser.js';
import {
  partitionAikenDocumentForImport,
  normalizeAikenImportValidationContext,
  AIKEN_DEFAULT_IMPORT_CONTEXT,
} from './aikenImportValidationPipeline.js';
import {
  AIKEN_IMPORT_VALIDATION_LAYERS,
  AIKEN_IMPORT_PERSISTENCE_CODES,
  buildAikenImportDiagnostic,
  mapDiagnosticsToStructuredErrors,
  sanitizePersistenceImportFailure,
} from './aikenImportDiagnostics.js';
import {
  IMPORT_BATCH_ITEM_STATUS,
  diagnosticToFailedBatchItem,
  diagnosticToSkippedBatchItem,
  insertImportBatchItem,
  insertImportBatchItemsBulk,
  countPersistedQuestionsForBatch,
} from './questionImportBatchItems.service.js';
import {
  IMPORT_DUPLICATE_POLICIES,
  ImportBatchDuplicateTracker,
  CourseQuestionDuplicateIndex,
  detectImportDuplicate,
  loadCourseQuestionDuplicateIndexSafe,
  normalizeDuplicatePolicy,
  summarizeReadyItemDuplicates,
} from './questionImportDuplicateDetection.service.js';
import { buildFingerprintsFromReadyItem } from './questionImportFingerprint.service.js';
import { validateQuestionMarks } from '../validators/questionMarks.validation.js';
import {
  logImportFailed,
  logImportStarted,
} from '../observability/lmsActionLogger.service.js';

const SOURCE_TYPE = 'AIKEN';

const BATCH_STATUS = Object.freeze({
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  PARTIAL: 'PARTIAL',
  FAILED: 'FAILED',
});

/**
 * @typedef {{
 *   course_id: number,
 *   subject_id?: number | null,
 *   topic?: string | null,
 *   difficulty?: string | null,
 *   created_by: number,
 *   content: string,
 *   file_name?: string | null,
 *   marks?: number,
 *   duplicate_policy?: string,
 * }} AikenImportRequest
 *
 * @typedef {import('./aikenImportDiagnostics.js').ReturnType<typeof buildAikenImportDiagnostic>} AikenImportError
 *
 * @typedef {{
 *   success: true,
 *   batchId: number,
 *   imported: number,
 *   skippedDuplicates: number,
 *   failed: number,
 *   errors: AikenImportError[],
 *   skipped: AikenImportError[],
 *   warnings: AikenImportError[],
 *   importedQuestionIds: number[],
 *   verifiedDbCount: number,
 *   structuredErrors: { index: number, message: string, type: string }[],
 * }} AikenImportResult
 */

/**
 * @param {unknown} raw
 * @returns {AikenImportRequest}
 */
function normalizeImportRequest(raw) {
  const body = typeof raw === 'object' && raw !== null ? raw : {};

  const marksResult = validateQuestionMarks(body.marks != null ? body.marks : null, {
    defaultWhenMissing: true,
  });

  return {
    course_id: Number(body.course_id ?? body.courseId),
    subject_id: body.subject_id ?? body.subjectId ?? null,
    topic: body.topic ?? null,
    difficulty: body.difficulty ?? null,
    created_by: Number(body.created_by ?? body.createdBy),
    content: String(body.content ?? ''),
    file_name: body.file_name ?? body.fileName ?? null,
    marks: marksResult.ok ? marksResult.marks : 1,
    duplicate_policy: normalizeDuplicatePolicy(body.duplicate_policy ?? body.duplicatePolicy),
  };
}

/**
 * @param {AikenImportRequest} request
 */
function assertImportRequest(request) {
  if (!String(request.content ?? '').trim()) {
    throw new ApiError(422, 'Import content is required', { code: 'IMPORT_CONTENT_REQUIRED' });
  }

  if (!Number.isFinite(request.course_id) || request.course_id <= 0) {
    throw new ApiError(422, 'course_id must be a positive number', { code: 'INVALID_COURSE_ID' });
  }

  if (!Number.isFinite(request.created_by) || request.created_by <= 0) {
    throw new ApiError(401, 'Authenticated admin required', { code: 'UNAUTHORIZED' });
  }

  const marksValidation = validateQuestionMarks(request.marks, { defaultWhenMissing: true });
  if (!marksValidation.ok) {
    throw new ApiError(422, marksValidation.message, { code: 'INVALID_MARKS' });
  }
  request.marks = marksValidation.marks;
}

/**
 * @param {number} imported
 * @param {number} failed
 * @param {number} [skippedDuplicates=0]
 * @returns {string}
 */
function resolveBatchStatus(imported, failed, skippedDuplicates = 0) {
  if (imported > 0 && failed === 0) {
    return BATCH_STATUS.COMPLETED;
  }
  if (imported > 0 && failed > 0) {
    return BATCH_STATUS.PARTIAL;
  }
  if (imported === 0 && failed > 0) {
    return BATCH_STATUS.FAILED;
  }
  if (imported === 0 && skippedDuplicates > 0) {
    return BATCH_STATUS.FAILED;
  }
  return BATCH_STATUS.FAILED;
}

/**
 * Pre-flight FK checks so preview-aligned payloads fail before the insert loop.
 *
 * @param {AikenImportRequest} request
 */
async function assertImportContextReferences(request) {
  const course = await getCourseRowById(request.course_id);
  if (!course) {
    throw new ApiError(404, 'Course not found', { code: 'COURSE_NOT_FOUND' });
  }

  const subjectId = request.subject_id != null ? Number(request.subject_id) : null;
  if (subjectId != null && Number.isFinite(subjectId) && subjectId > 0) {
    const [rows] = await mysqlPool.query(
      `SELECT id FROM subjects WHERE id = ? AND course_id = ? LIMIT 1`,
      [subjectId, request.course_id]
    );
    if (!rows.length) {
      throw new ApiError(404, 'Subject not found for this course', { code: 'SUBJECT_NOT_FOUND' });
    }
  }
}

/**
 * @param {{
 *   uploadedBy: number,
 *   fileName: string | null,
 *   totalQuestions: number,
 * }} input
 * @returns {Promise<number>}
 */
async function createImportBatch({ uploadedBy, fileName, totalQuestions }) {
  const [result] = await mysqlPool.query(
    `INSERT INTO question_import_batches
       (uploaded_by, source_type, file_name, total_questions, successful_questions, failed_questions, status)
     VALUES (?, ?, ?, ?, 0, 0, ?)`,
    [uploadedBy, SOURCE_TYPE, fileName, totalQuestions, BATCH_STATUS.PROCESSING]
  );

  const batchId = Number(result.insertId);
  if (!Number.isFinite(batchId) || batchId <= 0) {
    throw new ApiError(500, 'Import batch insert did not return a valid id', {
      code: 'IMPORT_BATCH_INSERT_FAILED',
    });
  }

  return batchId;
}

/**
 * @param {number} batchId
 * @param {{ imported: number, failed: number, totalQuestions: number, skippedDuplicates?: number }} summary
 */
async function finalizeImportBatch(batchId, { imported, failed, totalQuestions, skippedDuplicates = 0 }) {
  const status = resolveBatchStatus(imported, failed, skippedDuplicates);

  await mysqlPool.query(
    `UPDATE question_import_batches
     SET total_questions = ?,
         successful_questions = ?,
         failed_questions = ?,
         status = ?
     WHERE id = ?`,
    [totalQuestions, imported, failed, status, batchId]
  );

  return status;
}

/**
 * Import questions from Aiken-formatted content into the question bank.
 *
 * Validation uses partitionParsedAikenForImport — identical to previewAikenImport.
 * DB persistence uses createQuestionFromPreparedPayload (FK + transaction only).
 *
 * @param {unknown} request Import request context
 * @returns {Promise<AikenImportResult>}
 */
export async function importAikenQuestions(request) {
  const normalizedRequest = normalizeImportRequest(request);
  assertImportRequest(normalizedRequest);

  const userId = normalizedRequest.created_by;
  const courseId = normalizedRequest.course_id;

  const importContext = normalizeAikenImportValidationContext(normalizedRequest);
  const document = parseAikenDocument(normalizedRequest.content);
  const partitioned = partitionAikenDocumentForImport(document, importContext);
  const totalQuestions = partitioned.totalBlocks;

  /** @type {AikenImportError[]} */
  const errors = [...partitioned.errors];

  await assertImportContextReferences(normalizedRequest);

  const batchId = await createImportBatch({
    uploadedBy: normalizedRequest.created_by,
    fileName: normalizedRequest.file_name,
    totalQuestions,
  });

  logImportStarted({
    userId,
    batchId,
    entityId: batchId,
    courseId,
    fileName: normalizedRequest.file_name,
    totalQuestions,
  });

  const validationFailureItems = partitioned.errors.map((diagnostic) =>
    diagnosticToFailedBatchItem(batchId, diagnostic)
  );
  await insertImportBatchItemsBulk(mysqlPool, batchId, validationFailureItems);

  const duplicatePolicy = normalizedRequest.duplicate_policy ?? IMPORT_DUPLICATE_POLICIES.SKIP;
  let courseDuplicateIndex = new CourseQuestionDuplicateIndex();
  if (
    importContext.duplicate_check_enabled !== false &&
    duplicatePolicy !== IMPORT_DUPLICATE_POLICIES.ALLOW
  ) {
    courseDuplicateIndex = await loadCourseQuestionDuplicateIndexSafe(
      mysqlPool,
      normalizedRequest.course_id
    );
  }
  const batchDuplicateTracker = new ImportBatchDuplicateTracker();

  let imported = 0;
  let skippedDuplicates = 0;
  /** @type {number[]} */
  const importedQuestionIds = [];
  /** @type {AikenImportError[]} */
  const skipped = [];
  /** @type {AikenImportError[]} */
  const warnings = [];

  for (const item of partitioned.readyItems) {
    const { exactFingerprint, stemFingerprint } = buildFingerprintsFromReadyItem(item);
    const duplicateMatch = detectImportDuplicate({
      policy: duplicatePolicy,
      exactFingerprint,
      stemFingerprint,
      courseIndex: courseDuplicateIndex,
      batchTracker: batchDuplicateTracker,
    });

    if (duplicateMatch) {
      const diagnostic = buildAikenImportDiagnostic({
        questionNumber: item.questionNumber,
        questionTitle: item.aikenQuestion.question_text,
        errorCode: duplicateMatch.errorCode,
        message: duplicateMatch.message,
        validationLayer: duplicateMatch.validationLayer,
      });

      if (duplicatePolicy === IMPORT_DUPLICATE_POLICIES.SKIP) {
        skippedDuplicates += 1;
        skipped.push(diagnostic);
        await insertImportBatchItem(
          mysqlPool,
          diagnosticToSkippedBatchItem(batchId, diagnostic, {
            existingQuestionId: duplicateMatch.existingQuestionId,
          })
        );
        continue;
      }

      if (duplicatePolicy === IMPORT_DUPLICATE_POLICIES.WARN) {
        warnings.push(diagnostic);
      }
    }

    batchDuplicateTracker.record(item.questionNumber, exactFingerprint, stemFingerprint);

    try {
      const created = await createQuestionFromPreparedPayload(
        item.writePayload,
        normalizedRequest.created_by
      );
      const questionId = Number(created?.question_id ?? created?.id);
      if (!Number.isFinite(questionId) || questionId <= 0) {
        const diagnostic = buildAikenImportDiagnostic({
          questionNumber: item.questionNumber,
          questionTitle: item.aikenQuestion.question_text,
          errorCode: AIKEN_IMPORT_PERSISTENCE_CODES.QUESTION_INSERT_FAILED,
          message: 'Question was saved but no question id was returned.',
          validationLayer: AIKEN_IMPORT_VALIDATION_LAYERS.PERSISTENCE,
        });
        errors.push(diagnostic);
        await insertImportBatchItem(mysqlPool, {
          batchId,
          questionNumber: item.questionNumber,
          questionTitle: item.aikenQuestion.question_text,
          questionId: null,
          status: IMPORT_BATCH_ITEM_STATUS.FAILED,
          errorCode: diagnostic.errorCode,
          errorMessage: diagnostic.message,
          validationLayer: diagnostic.validationLayer,
        });
        continue;
      }

      imported += 1;
      importedQuestionIds.push(questionId);
      courseDuplicateIndex.add(questionId, exactFingerprint, stemFingerprint);

      await insertImportBatchItem(mysqlPool, {
        batchId,
        questionNumber: item.questionNumber,
        questionTitle: item.aikenQuestion.question_text,
        questionId,
        status: IMPORT_BATCH_ITEM_STATUS.SUCCESS,
        errorCode: null,
        errorMessage: null,
        validationLayer: null,
      });
    } catch (error) {
      const failure = sanitizePersistenceImportFailure(error);
      const diagnostic = buildAikenImportDiagnostic({
        questionNumber: item.questionNumber,
        questionTitle: item.aikenQuestion.question_text,
        errorCode: failure.code,
        message: failure.message,
        validationLayer: AIKEN_IMPORT_VALIDATION_LAYERS.PERSISTENCE,
      });
      errors.push(diagnostic);

      await insertImportBatchItem(mysqlPool, {
        batchId,
        questionNumber: item.questionNumber,
        questionTitle: item.aikenQuestion.question_text,
        questionId: null,
        status: IMPORT_BATCH_ITEM_STATUS.FAILED,
        errorCode: failure.code,
        errorMessage: failure.message,
        validationLayer: AIKEN_IMPORT_VALIDATION_LAYERS.PERSISTENCE,
      });
    }
  }

  const failed = errors.length;
  let verifiedDbCount = await countPersistedQuestionsForBatch(mysqlPool, batchId);
  let countReconciled = false;

  if (verifiedDbCount !== imported) {
    countReconciled = true;
    imported = verifiedDbCount;
    importedQuestionIds.length = 0;
    if (verifiedDbCount > 0) {
      const [idRows] = await mysqlPool.query(
        `SELECT question_id
         FROM question_import_batch_items
         WHERE batch_id = ?
           AND status = ?
           AND question_id IS NOT NULL
         ORDER BY question_number ASC`,
        [batchId, IMPORT_BATCH_ITEM_STATUS.SUCCESS]
      );
      for (const row of idRows) {
        const qid = Number(row.question_id);
        if (Number.isFinite(qid) && qid > 0) {
          importedQuestionIds.push(qid);
        }
      }
    }
  }

  const status = await finalizeImportBatch(batchId, {
    imported,
    failed,
    totalQuestions,
    skippedDuplicates,
  });

  const importSummary = {
    userId,
    batchId,
    entityId: batchId,
    courseId,
    imported,
    skippedDuplicates,
    failed,
    totalQuestions,
    status,
    verifiedDbCount,
    countReconciled,
  };

  if (imported > 0) {
    logImportCompleted(importSummary);
  } else {
    logImportFailed(importSummary);
  }

  return {
    success: true,
    batchId,
    imported,
    skippedDuplicates,
    failed,
    errors,
    skipped,
    warnings,
    importedQuestionIds,
    verifiedDbCount,
    structuredErrors: mapDiagnosticsToStructuredErrors(errors),
  };
}

/**
 * Parse and validate Aiken content without persisting to the question bank.
 * Runs the same validation pipeline as importAikenQuestions (minus DB FK checks).
 *
 * @param {unknown} content Raw Aiken text
 * @param {import('./aikenImportValidationPipeline.js').AikenImportValidationContext} [importContext]
 * @param {{ previewMode?: boolean }} [options]
 */
export async function previewAikenImport(
  content,
  importContext = AIKEN_DEFAULT_IMPORT_CONTEXT,
  options = {}
) {
  const text = String(content ?? '').trim();
  if (!text) {
    throw new ApiError(422, 'Import content is required', { code: 'IMPORT_CONTENT_REQUIRED' });
  }

  const previewMode = options.previewMode !== false;
  const normalizedContext = normalizeAikenImportValidationContext(importContext, { previewMode });

  const document = parseAikenDocument(text);
  const partitioned = partitionAikenDocumentForImport(document, normalizedContext);

  const duplicatePolicy = normalizedContext.duplicate_policy ?? IMPORT_DUPLICATE_POLICIES.SKIP;
  let courseDuplicateIndex = new CourseQuestionDuplicateIndex();
  if (
    normalizedContext.duplicate_check_enabled !== false &&
    duplicatePolicy !== IMPORT_DUPLICATE_POLICIES.ALLOW
  ) {
    courseDuplicateIndex = await loadCourseQuestionDuplicateIndexSafe(
      mysqlPool,
      normalizedContext.course_id
    );
  }

  const duplicateSummary = summarizeReadyItemDuplicates({
    readyItems: partitioned.readyItems,
    courseIndex: courseDuplicateIndex,
    policy: duplicatePolicy,
  });

  const skippedQuestionNumbers = new Set(
    duplicateSummary.skipped.map((entry) => entry.questionNumber)
  );
  const importableItems =
    duplicatePolicy === IMPORT_DUPLICATE_POLICIES.SKIP
      ? partitioned.readyItems.filter((item) => !skippedQuestionNumbers.has(item.questionNumber))
      : partitioned.readyItems;

  const duplicates = duplicateSummary.skipped.map((entry) =>
    buildAikenImportDiagnostic({
      questionNumber: entry.questionNumber,
      questionTitle: entry.questionTitle,
      errorCode: entry.errorCode,
      message: entry.message,
      validationLayer: entry.validationLayer,
    })
  );
  const warnings = duplicateSummary.warnings.map((entry) =>
    buildAikenImportDiagnostic({
      questionNumber: entry.questionNumber,
      questionTitle: entry.questionTitle,
      errorCode: entry.errorCode,
      message: entry.message,
      validationLayer: entry.validationLayer,
    })
  );

  const validationErrors = partitioned.errors;
  const failedQuestions = validationErrors.length;

  const diagnostics = {
    totalQuestions: partitioned.totalBlocks,
    parsedQuestions: partitioned.parsedQuestions,
    validQuestions: partitioned.readyItems.length,
    duplicates: duplicates.length,
    failedQuestions,
  };

  return {
    success: true,
    imported: importableItems.length,
    skippedDuplicates: duplicateSummary.skippedDuplicates,
    failed: failedQuestions,
    errors: validationErrors,
    skipped: duplicates,
    duplicates,
    warnings,
    questions: importableItems.map((item) => item.aikenQuestion),
    diagnostics,
  };
}

export { AIKEN_DEFAULT_IMPORT_CONTEXT } from './aikenImportValidationPipeline.js';
