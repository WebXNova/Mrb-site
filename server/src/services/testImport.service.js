/**
 * TestImportService — production-grade test import engine (JSON + CSV).
 *
 * Wizard flow:
 * 1. Upload file (client)
 * 2. Validate structure (validateTestImport)
 * 3. Preview summary (previewTestImport)
 * 4. Confirm import (confirmTestImport) — atomic transaction
 * 5. Success report (response)
 */

import { mysqlPool } from '../config/mysql.js';
import { ApiError } from '../utils/apiError.js';
import { getCourseRowById } from './courseCatalogQueries.service.js';
import { getTestById } from './test.service.js';
import {
  validateTestImportFile,
  validateTestImportWithDiagnostics,
  parseTestImportFile,
} from './testImportValidation.service.js';
import { rematerializeZipImportMedia } from './testImportMedia.service.js';
import { rematerializeCsvImportMedia } from './testExportCsvMedia.service.js';
import { recordImportBatchMetrics } from './testTransferHistory.service.js';
import { TEST_EXPORT_FORMATS } from '../constants/testRichContent.constants.js';
import { safeUnlink } from './questionBankImageUpload.service.js';
import { QUESTION_BANK_UPLOAD_DIR } from './questionBankImageUpload.service.js';
import path from 'path';
import {
  assertCourseExistsForImport,
  assertImportedQuestionIntegrity,
  createTestImportBatch,
  finalizeTestImportBatchFailure,
  finalizeTestImportBatchSuccess,
  insertImportedQuestionBankRow,
  insertImportedQuestionOptions,
  insertImportedTestQuestionLink,
  insertImportedTestRow,
  insertImportedTestSubjects,
} from '../repositories/testRichContentImport.repository.js';

const LOG_PREFIX = '[test-import]';

/**
 * Step 2 — Validate uploaded file structure and content.
 *
 * @param {{
 *   course_id: number,
 *   content: string,
 *   format?: 'json'|'csv'|'auto',
 *   file_name?: string|null,
 * }} request
 */
export async function validateTestImport(request) {
  const courseId = Number(request.course_id);
  if (!Number.isInteger(courseId) || courseId <= 0) {
    return {
      valid: false,
      step: 'validate',
      issues: [
        {
          severity: 'error',
          code: 'COURSE_ID_INVALID',
          message: 'course_id must be a positive integer.',
          validationLayer: 'schema',
        },
      ],
    };
  }

  const result = await validateTestImportFile(
    String(request.content ?? ''),
    courseId,
    request.format ?? 'auto'
  );

  return {
    valid: result.valid,
    step: 'validate',
    format: result.format ?? request.format ?? 'auto',
    file_name: request.file_name ?? null,
    issues: result.issues ?? [],
    summary: result.summary ?? null,
  };
}

/**
 * Step 3 — Preview import summary (requires passing validation).
 *
 * @param {{
 *   course_id: number,
 *   content: string,
 *   format?: 'json'|'csv'|'auto',
 *   file_name?: string|null,
 * }} request
 */
export async function previewTestImport(request) {
  const validation = await validateTestImport(request);
  if (!validation.valid) {
    return {
      ...validation,
      step: 'preview',
      preview: null,
    };
  }

  const parsed = await parseTestImportFile(String(request.content ?? ''), request.format ?? 'auto');
  if (!parsed.ok) {
    return {
      valid: false,
      step: 'preview',
      issues: [
        {
          severity: 'error',
          code: parsed.code,
          message: parsed.message,
          validationLayer: parsed.validationLayer ?? 'parse',
        },
      ],
      preview: null,
    };
  }

  const diagnostics = validateTestImportWithDiagnostics(parsed.package, Number(request.course_id));
  if (!diagnostics.valid) {
    return {
      valid: false,
      step: 'preview',
      format: parsed.format,
      issues: diagnostics.issues,
      preview: null,
    };
  }

  const pkg = diagnostics.package;
  const test = pkg?.test ?? {};

  return {
    valid: true,
    step: 'preview',
    format: parsed.format,
    file_name: request.file_name ?? null,
    issues: [],
    preview: {
      title: test.title ?? 'Untitled Test',
      description: test.description ?? null,
      category: test.category ?? 'MDCAT',
      test_type: test.test_type ?? 'mixed_subject',
      duration_minutes: test.duration_minutes ?? null,
      passing_marks: test.passing_marks ?? 0,
      max_attempts: test.max_attempts ?? 1,
      question_count: diagnostics.summary?.question_count ?? pkg?.questions?.length ?? 0,
      subject_ids: diagnostics.summary?.subject_ids ?? pkg?.subject_ids ?? [],
      settings: {
        shuffle_questions: Boolean(test.shuffle_questions),
        shuffle_options: Boolean(test.shuffle_options),
        show_explanations: test.show_explanations !== false,
        show_result_immediately: test.show_result_immediately !== false,
        show_answers_after_submit: Boolean(test.show_answers_after_submit),
        allow_retake: Boolean(test.allow_retake),
        access_mode: test.access_mode ?? 'private',
        negative_marking: Number(test.negative_marking ?? 0),
      },
      media_bundle: Boolean(parsed.package?.media_bundle),
      image_count: parsed.imageFiles?.size ?? 0,
      sample_questions: (pkg?.questions ?? []).slice(0, 3).map((q, index) => ({
        index: index + 1,
        display_order: q.display_order ?? index,
        topic: q.topic ?? null,
        question_html_preview: String(q.question_html ?? q.question_text ?? '').slice(0, 200),
        marks: q.marks ?? 1,
        correct_answer:
          q.correct_answer ??
          (Array.isArray(q.options) ? q.options.find((o) => o.is_correct)?.option_key : null),
      })),
    },
  };
}

/** @deprecated Use previewTestImport */
export async function previewRichContentImport(rawPayload, courseId) {
  const content = typeof rawPayload === 'string' ? rawPayload : JSON.stringify(rawPayload);
  const result = await previewTestImport({ course_id: courseId, content, format: 'auto' });
  if (!result.valid) {
    return {
      valid: false,
      code: result.issues?.[0]?.code ?? 'VALIDATION_FAILED',
      message: result.issues?.[0]?.message ?? 'Validation failed.',
      validationLayer: result.issues?.[0]?.validationLayer ?? null,
      details: result.issues ?? null,
    };
  }
  return {
    valid: true,
    question_count: result.preview?.question_count ?? 0,
    title: result.preview?.title ?? null,
    subject_ids: result.preview?.subject_ids ?? [],
  };
}

/**
 * Step 4+5 — Confirm and atomically create test.
 *
 * @param {{
 *   course_id: number,
 *   content: string,
 *   format?: 'json'|'csv'|'auto',
 *   file_name?: string|null,
 *   confirm?: boolean,
 * }} request
 * @param {number} userId
 * @param {string} [role]
 */
export async function confirmTestImport(request, userId, role = 'admin') {
  if (request.confirm === false) {
    throw new ApiError(422, 'Import confirmation is required.', { code: 'IMPORT_NOT_CONFIRMED' });
  }

  const courseId = Number(request.course_id);
  if (!Number.isInteger(courseId) || courseId <= 0) {
    throw new ApiError(422, 'course_id must be a positive integer.', { code: 'COURSE_ID_INVALID' });
  }

  if (!Number.isInteger(userId) || userId <= 0) {
    throw new ApiError(401, 'Authenticated admin required', { code: 'UNAUTHORIZED' });
  }

  const course = await getCourseRowById(courseId);
  if (!course) {
    throw new ApiError(404, 'Course not found', { code: 'COURSE_NOT_FOUND' });
  }

  const startedAt = Date.now();

  const validation = await validateTestImportFile(
    String(request.content ?? ''),
    courseId,
    request.format ?? 'auto'
  );

  if (!validation.valid) {
    throw new ApiError(422, validation.issues?.[0]?.message ?? 'Import validation failed.', {
      code: validation.issues?.[0]?.code ?? 'VALIDATION_FAILED',
      issues: validation.issues,
    });
  }

  let pkg = validation.package;
  let preparedQuestions = validation.preparedQuestions;
  /** @type {string[]} */
  let uploadedMediaFilenames = [];

  const connection = await mysqlPool.getConnection();
  let batchId = null;

  try {
    batchId = await createTestImportBatch(connection, {
      uploadedBy: userId,
      courseId,
      fileName: request.file_name ?? null,
      totalQuestions: preparedQuestions.length,
    });

    console.info(`${LOG_PREFIX} import started`, {
      batchId,
      courseId,
      userId,
      format: validation.format,
      questionCount: preparedQuestions.length,
      fileName: request.file_name ?? null,
    });

    await connection.beginTransaction();

    if (validation.format === TEST_EXPORT_FORMATS.ZIP && validation.imageFiles) {
      const rematerialized = await rematerializeZipImportMedia(validation.package, validation.imageFiles, {
        userId,
        role,
      });
      pkg = rematerialized.package;
      uploadedMediaFilenames = rematerialized.uploadedFilenames ?? [];

      const postMediaValidation = validateTestImportWithDiagnostics(pkg, courseId);
      if (!postMediaValidation.valid) {
        throw new ApiError(
          422,
          postMediaValidation.issues?.[0]?.message ?? 'Import validation failed after media upload.',
          {
            code: postMediaValidation.issues?.[0]?.code ?? 'VALIDATION_FAILED',
            issues: postMediaValidation.issues,
          }
        );
      }
      preparedQuestions = postMediaValidation.preparedQuestions;
      pkg = postMediaValidation.package;
    } else if (validation.format === TEST_EXPORT_FORMATS.CSV) {
      const rematerialized = await rematerializeCsvImportMedia(validation.package, {
        userId,
        role,
      });
      pkg = rematerialized.package;
      uploadedMediaFilenames = rematerialized.uploadedFilenames ?? [];

      const postMediaValidation = validateTestImportWithDiagnostics(pkg, courseId);
      if (!postMediaValidation.valid) {
        throw new ApiError(
          422,
          postMediaValidation.issues?.[0]?.message ?? 'Import validation failed after embedded media upload.',
          {
            code: postMediaValidation.issues?.[0]?.code ?? 'VALIDATION_FAILED',
            issues: postMediaValidation.issues,
          }
        );
      }
      preparedQuestions = postMediaValidation.preparedQuestions;
      pkg = postMediaValidation.package;
    }

    await assertCourseExistsForImport(connection, courseId);

    // Resolve subject_ids: silently drop any that don't exist in the target course
    const resolvedSubjectIds = [];
    if (Array.isArray(pkg.subject_ids) && pkg.subject_ids.length) {
      const placeholders = pkg.subject_ids.map(() => '?').join(',');
      const [subjectRows] = await connection.query(
        `SELECT id FROM subjects WHERE course_id = ? AND id IN (${placeholders})`,
        [courseId, ...pkg.subject_ids]
      );
      const foundIds = new Set(subjectRows.map((r) => r.id));
      for (const sid of pkg.subject_ids) {
        if (foundIds.has(sid)) {
          resolvedSubjectIds.push(sid);
        }
      }
    }
    pkg.subject_ids = resolvedSubjectIds;

    const testId = await insertImportedTestRow(connection, pkg.test, courseId, userId);
    if (!Number.isFinite(testId) || testId <= 0) {
      throw new ApiError(500, 'Test insert did not return a valid id.', { code: 'TEST_INSERT_FAILED' });
    }

    await insertImportedTestSubjects(connection, testId, pkg.subject_ids);

    for (const item of preparedQuestions) {
      const questionId = await insertImportedQuestionBankRow(connection, item.prepared, userId);
      await insertImportedQuestionOptions(connection, questionId, item.prepared.options);
      await assertImportedQuestionIntegrity(connection, questionId);
      await insertImportedTestQuestionLink(
        connection,
        testId,
        questionId,
        item.display_order,
        item.marks_override ?? null
      );
    }

    await connection.commit();
    await finalizeTestImportBatchSuccess(connection, batchId, testId);

    const processingTimeMs = Date.now() - startedAt;
    await recordImportBatchMetrics(batchId, {
      format: validation.format ?? request.format ?? 'auto',
      imageCount: validation.imageFiles?.size ?? validation.package?.media?.length ?? 0,
      validationErrorCount: 0,
      processingTimeMs,
    });

    console.info(`${LOG_PREFIX} import completed`, {
      batchId,
      testId,
      courseId,
      userId,
      questionCount: preparedQuestions.length,
    });

    const createdTest = await getTestById(testId);

    return {
      step: 'success',
      batch_id: batchId,
      test_id: testId,
      course_id: courseId,
      question_count: preparedQuestions.length,
      format: validation.format,
      file_name: request.file_name ?? null,
      test: createdTest,
      report: {
        title: pkg.test?.title ?? createdTest?.title ?? null,
        imported_questions: preparedQuestions.length,
        subject_ids: pkg.subject_ids ?? [],
        status: 'COMPLETED',
        processing_time_ms: processingTimeMs,
      },
    };
  } catch (error) {
    console.error(`${LOG_PREFIX} import failed`, {
      batchId,
      courseId,
      userId,
      message: error instanceof Error ? error.message : String(error),
      code: error?.code,
    });

    try {
      await connection.rollback();
    } catch (rollbackError) {
      console.error(`${LOG_PREFIX} rollback failed`, {
        message: rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
      });
    }

    for (const filename of uploadedMediaFilenames) {
      const fullPath = path.join(QUESTION_BANK_UPLOAD_DIR, path.basename(filename));
      await safeUnlink(fullPath);
    }

    if (batchId != null) {
      try {
        await finalizeTestImportBatchFailure(
          connection,
          batchId,
          error?.code ?? 'IMPORT_FAILED',
          error instanceof Error ? error.message : String(error)
        );
        await recordImportBatchMetrics(batchId, {
          format: request.format ?? 'auto',
          validationErrorCount: error?.issues?.length ?? 0,
          processingTimeMs: Date.now() - startedAt,
        });
      } catch (batchError) {
        console.error(`${LOG_PREFIX} batch failure update failed`, {
          message: batchError instanceof Error ? batchError.message : String(batchError),
        });
      }
    }

    if (error instanceof ApiError) throw error;

    if (error?.code === 'COURSE_NOT_FOUND') {
      throw new ApiError(404, 'Course not found', { code: 'COURSE_NOT_FOUND' });
    }
    if (error?.code === 'SUBJECT_NOT_FOUND') {
      throw new ApiError(422, error.message, { code: 'SUBJECT_NOT_FOUND' });
    }

    throw new ApiError(500, 'Test import failed.', {
      code: 'IMPORT_FAILED',
      cause: error instanceof Error ? error.message : String(error),
    });
  } finally {
    connection.release();
  }
}

/** @deprecated Use confirmTestImport */
export async function importRichContentTest(request, userId, role = 'admin') {
  return confirmTestImport({ ...request, confirm: true }, userId, role);
}
