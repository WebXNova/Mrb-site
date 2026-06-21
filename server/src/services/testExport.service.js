/**
 * TestExportService — production-grade test export engine (JSON + CSV).
 */

import { mysqlPool } from '../config/mysql.js';
import { ApiError } from '../utils/apiError.js';
import {
  MAX_TEST_EXPORT_QUESTIONS,
  TEST_EXPORT_FORMATS,
  TEST_EXPORT_JSON_VERSION,
} from '../constants/testRichContent.constants.js';
import {
  resolveExplanationHtml,
  resolveOptionHtml,
  resolveQuestionHtml,
} from '../utils/richHtmlContent.js';
import {
  buildTestExportJsonDocument,
  serializeTestExportJsonBuffer,
} from '../utils/testExportJson.serializer.js';
import { serializeTestExportCsvBuffer } from '../utils/testExportCsv.serializer.js';
import { buildTestExportZipBundle } from '../utils/testExportZip.serializer.js';
import { inlineMediaInExportDocument } from './testExportCsvMedia.service.js';
import { MAX_IMPORT_PAYLOAD_BYTES } from '../constants/testRichContent.constants.js';
import { assertTestMutationAccess } from './testMutationAccess.service.js';
import { loadRichContentExportRows } from '../repositories/testRichContentImport.repository.js';

/**
 * @param {Record<string, unknown>} testRow
 */
function mapTestMetadataForExport(testRow) {
  let tags = [];
  try {
    const parsed = JSON.parse(String(testRow.tags_json ?? '[]'));
    tags = Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    tags = [];
  }

  return {
    title: String(testRow.title ?? ''),
    description: testRow.description == null ? null : String(testRow.description),
    category: String(testRow.category ?? 'MDCAT'),
    test_type: String(testRow.test_type ?? 'mixed_subject'),
    duration_minutes: Number(testRow.duration_minutes),
    passing_marks: Number(testRow.passing_marks ?? 0),
    max_attempts: Number(testRow.max_attempts ?? 1),
    negative_marking: Number(testRow.negative_marking ?? 0),
    shuffle_questions: Boolean(Number(testRow.shuffle_questions)),
    shuffle_options: Boolean(Number(testRow.shuffle_options)),
    show_explanations: Boolean(Number(testRow.show_explanations)),
    show_result_immediately: Boolean(Number(testRow.show_result_immediately)),
    show_answers_after_submit: Boolean(Number(testRow.show_answers_after_submit)),
    allow_retake: Boolean(Number(testRow.allow_retake)),
    access_mode: String(testRow.access_mode ?? 'private'),
    tags,
  };
}

/**
 * @param {Record<string, unknown>} linkRow
 * @param {Array<Record<string, unknown>>} optionRows
 */
function mapQuestionForExport(linkRow, optionRows) {
  const questionHtml = resolveQuestionHtml(linkRow);
  const explanationHtml = resolveExplanationHtml(linkRow);

  const options = optionRows.map((option) => {
    const optionHtml = resolveOptionHtml(option);
    return {
      option_key: String(option.option_key),
      option_html: optionHtml,
      option_text: optionHtml,
      image_url: option.image_url == null ? null : String(option.image_url),
      is_correct: Boolean(Number(option.is_correct)),
      sort_order: Number(option.sort_order ?? 0),
    };
  });

  const correctAnswer = options.find((o) => o.is_correct)?.option_key ?? null;

  return {
    display_order: Number(linkRow.display_order ?? 0),
    marks_override: linkRow.marks_override == null ? null : Number(linkRow.marks_override),
    topic: linkRow.topic == null ? null : String(linkRow.topic),
    difficulty: linkRow.difficulty == null ? null : String(linkRow.difficulty),
    question_type: String(linkRow.question_type ?? 'mcq'),
    question_html: questionHtml,
    question_text: questionHtml,
    question_image_url:
      linkRow.question_image_url == null ? null : String(linkRow.question_image_url),
    explanation_html: explanationHtml,
    explanation: explanationHtml,
    marks: Number(linkRow.marks ?? 1),
    correct_answer: correctAnswer,
    options,
  };
}

/**
 * @param {{
 *   test: Record<string, unknown>,
 *   subjectIds: number[],
 *   linkRows: Array<Record<string, unknown>>,
 *   optionsByQuestion: Map<number, Array<Record<string, unknown>>>,
 *   testId: number,
 *   courseId: number,
 * }} loaded
 */
export function buildTestExportDocument(loaded) {
  const questions = loaded.linkRows.map((linkRow) => {
    const questionId = Number(linkRow.question_id);
    const optionRows = loaded.optionsByQuestion.get(questionId) ?? [];
    return mapQuestionForExport(linkRow, optionRows);
  });

  return buildTestExportJsonDocument({
    test_id: loaded.testId,
    course_id: loaded.courseId,
    subject_ids: loaded.subjectIds,
    test: mapTestMetadataForExport(loaded.test),
    questions,
  });
}

/** @deprecated Use buildTestExportDocument — kept for existing tests. */
export function buildRichContentExportPackage(loaded) {
  const doc = buildTestExportDocument({
    ...loaded,
    testId: Number(loaded.test?.id ?? 0),
    courseId: Number(loaded.test?.course_id ?? 0),
  });
  return {
    format_version: 1,
    format: 'mrb_test_rich_v1',
    exported_at: doc.exported_at,
    test: doc.test,
    subject_ids: doc.subject_ids,
    questions: doc.questions,
  };
}

/**
 * @param {string} format
 */
function normalizeExportFormat(format) {
  const normalized = String(format ?? TEST_EXPORT_FORMATS.JSON).trim().toLowerCase();
  if (normalized === TEST_EXPORT_FORMATS.JSON || normalized === 'application/json') {
    return TEST_EXPORT_FORMATS.JSON;
  }
  if (normalized === TEST_EXPORT_FORMATS.CSV || normalized === 'text/csv') {
    return TEST_EXPORT_FORMATS.CSV;
  }
  if (normalized === TEST_EXPORT_FORMATS.ZIP || normalized === 'application/zip') {
    return TEST_EXPORT_FORMATS.ZIP;
  }
  throw new ApiError(422, 'Export format must be "json", "csv", or "zip".', {
    code: 'INVALID_EXPORT_FORMAT',
    format: normalized,
  });
}

/**
 * @param {number} testId
 * @param {string} [format]
 * @param {{ userId?: number|null, role?: string|null }} [access]
 */
export async function exportTest(testId, format = TEST_EXPORT_FORMATS.JSON, access = {}) {
  const tid = Number(testId);
  if (!Number.isInteger(tid) || tid <= 0) {
    throw new ApiError(400, 'Invalid test id', { code: 'INVALID_TEST_ID' });
  }

  const exportFormat = normalizeExportFormat(format);

  if (access.userId != null) {
    await assertTestMutationAccess(tid, access.userId, access.role ?? 'admin', {
      action: 'export_test',
    });
  }

  const loaded = await loadRichContentExportRows(mysqlPool, tid);
  if (!loaded) {
    throw new ApiError(404, 'Test not found', { code: 'TEST_NOT_FOUND' });
  }

  if (!loaded.linkRows.length) {
    throw new ApiError(422, 'Test has no active questions to export.', {
      code: 'TEST_EMPTY',
      testId: tid,
    });
  }

  if (loaded.linkRows.length > MAX_TEST_EXPORT_QUESTIONS) {
    throw new ApiError(422, `Test exceeds maximum export limit of ${MAX_TEST_EXPORT_QUESTIONS} questions.`, {
      code: 'TEST_TOO_LARGE',
      testId: tid,
      questionCount: loaded.linkRows.length,
      limit: MAX_TEST_EXPORT_QUESTIONS,
    });
  }

  const document = buildTestExportDocument({
    test: loaded.test,
    subjectIds: loaded.subjectIds,
    linkRows: loaded.linkRows,
    optionsByQuestion: loaded.optionsByQuestion,
    testId: tid,
    courseId: Number(loaded.test.course_id),
  });

  const slug = String(loaded.test.title ?? 'test')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || `test-${tid}`;

  if (exportFormat === TEST_EXPORT_FORMATS.CSV) {
    const { document: inlinedDocument, inlined_count, warnings } =
      await inlineMediaInExportDocument(document);
    const buffer = serializeTestExportCsvBuffer(inlinedDocument);

    if (buffer.length > MAX_IMPORT_PAYLOAD_BYTES) {
      throw new ApiError(
        422,
        `CSV export exceeds maximum file size of ${Math.round(MAX_IMPORT_PAYLOAD_BYTES / (1024 * 1024))} MB. Try removing large images or split the test.`,
        {
          code: 'TEST_EXPORT_TOO_LARGE',
          testId: tid,
          byteSize: buffer.length,
          limit: MAX_IMPORT_PAYLOAD_BYTES,
        }
      );
    }

    return {
      test_id: tid,
      course_id: Number(loaded.test.course_id),
      question_count: inlinedDocument.questions.length,
      format: TEST_EXPORT_FORMATS.CSV,
      version: TEST_EXPORT_JSON_VERSION,
      file_name: `${slug}-export.csv`,
      mime_type: 'text/csv; charset=utf-8',
      buffer,
      inlined_image_count: inlined_count,
      media_warnings: warnings,
    };
  }

  if (exportFormat === TEST_EXPORT_FORMATS.ZIP) {
    const zipBundle = await buildTestExportZipBundle(document);
    return {
      test_id: tid,
      course_id: Number(loaded.test.course_id),
      question_count: document.questions.length,
      image_count: zipBundle.image_count,
      format: TEST_EXPORT_FORMATS.ZIP,
      version: TEST_EXPORT_JSON_VERSION,
      file_name: `${slug}-export.zip`,
      mime_type: 'application/zip',
      buffer: zipBundle.zipBuffer,
      content: zipBundle.manifest,
      media_warnings: zipBundle.media_warnings,
    };
  }

  return {
    test_id: tid,
    course_id: Number(loaded.test.course_id),
    question_count: document.questions.length,
    format: TEST_EXPORT_FORMATS.JSON,
    version: TEST_EXPORT_JSON_VERSION,
    file_name: `${slug}-export.json`,
    mime_type: 'application/json; charset=utf-8',
    buffer: serializeTestExportJsonBuffer(document),
    content: document,
  };
}

/**
 * @param {number} testId
 * @param {{ userId?: number|null, role?: string|null }} [access]
 */
export async function exportRichContentTest(testId, access = {}) {
  const result = await exportTest(testId, TEST_EXPORT_FORMATS.JSON, access);
  return {
    test_id: result.test_id,
    course_id: result.course_id,
    question_count: result.question_count,
    file_name: result.file_name,
    content: result.content,
  };
}
