/**
 * TestImportValidationService — validates rich-content test import/export packages.
 *
 * Security: malformed HTML, oversized payloads, invalid structures.
 * Does not persist data.
 */

import { ApiError } from '../utils/apiError.js';
import { richContentExportPackageSchema } from '../validators/testRichContentImport.schema.js';
import { normalizeExportJsonForImport } from '../utils/testExportJson.serializer.js';
import {
  detectTestImportFormat,
  parseTestImportCsv,
} from '../utils/testImportCsv.parser.js';
import {
  decodeZipImportContent,
  isLikelyZipImportContent,
  parseTestImportZip,
} from '../utils/testImportZip.parser.js';
import { detectDuplicateQuestionsInImport } from './testImportDuplicate.service.js';
import {
  MAX_IMPORT_JSON_STRING_LENGTH,
  MAX_IMPORT_PAYLOAD_BYTES,
  MAX_IMPORT_ZIP_BASE64_LENGTH,
  TEST_EXPORT_JSON_VERSION,
  TEST_EXPORT_FORMATS,
  TEST_RICH_CONTENT_VALIDATION_LAYERS,
} from '../constants/testRichContent.constants.js';
import { normalizeImportQuestionRichFields, attachRichHtmlMirrorFields } from '../utils/richHtmlContent.js';
import { validateQuestionWritePayload } from './questionWritePrepare.service.js';
import { PHASE_1_QUESTION_TYPE } from '../validators/questionWrite.schema.js';

/**
 * @param {string|Buffer|Uint8Array} raw
 * @returns {{ ok: true, byteLength: number } | { ok: false, code: string, message: string, validationLayer: string }}
 */
export function validateImportPayloadSize(raw) {
  let byteLength = 0;
  if (typeof raw === 'string') {
    byteLength = Buffer.byteLength(raw, 'utf8');
    if (raw.length > MAX_IMPORT_JSON_STRING_LENGTH) {
      return {
        ok: false,
        code: 'IMPORT_PAYLOAD_TOO_LARGE',
        message: `Import payload exceeds maximum length (${MAX_IMPORT_JSON_STRING_LENGTH} characters).`,
        validationLayer: TEST_RICH_CONTENT_VALIDATION_LAYERS.PAYLOAD_SIZE,
      };
    }
  } else if (raw instanceof Buffer || raw instanceof Uint8Array) {
    byteLength = raw.byteLength ?? raw.length;
  } else if (raw != null) {
    return {
      ok: false,
      code: 'IMPORT_PAYLOAD_INVALID',
      message: 'Import payload must be a JSON string or buffer.',
      validationLayer: TEST_RICH_CONTENT_VALIDATION_LAYERS.PAYLOAD_SIZE,
    };
  } else {
    return {
      ok: false,
      code: 'IMPORT_PAYLOAD_EMPTY',
      message: 'Import payload is required.',
      validationLayer: TEST_RICH_CONTENT_VALIDATION_LAYERS.PAYLOAD_SIZE,
    };
  }

  if (byteLength > MAX_IMPORT_PAYLOAD_BYTES) {
    return {
      ok: false,
      code: 'IMPORT_PAYLOAD_TOO_LARGE',
      message: `Import payload exceeds maximum size (${MAX_IMPORT_PAYLOAD_BYTES} bytes).`,
      validationLayer: TEST_RICH_CONTENT_VALIDATION_LAYERS.PAYLOAD_SIZE,
    };
  }

  if (byteLength === 0) {
    return {
      ok: false,
      code: 'IMPORT_PAYLOAD_EMPTY',
      message: 'Import payload is empty.',
      validationLayer: TEST_RICH_CONTENT_VALIDATION_LAYERS.PAYLOAD_SIZE,
    };
  }

  return { ok: true, byteLength };
}

/**
 * @param {string|Buffer|Uint8Array|Record<string, unknown>} raw
 * @returns {{ ok: true, parsed: Record<string, unknown> } | { ok: false, code: string, message: string, validationLayer: string }}
 */
export function parseImportJsonPayload(raw) {
  if (typeof raw === 'object' && raw !== null && !Buffer.isBuffer(raw)) {
    return { ok: true, parsed: raw };
  }

  const sizeCheck = validateImportPayloadSize(raw);
  if (!sizeCheck.ok) {
    return sizeCheck;
  }

  let text;
  try {
    text = typeof raw === 'string' ? raw : Buffer.from(raw).toString('utf8');
  } catch {
    return {
      ok: false,
      code: 'IMPORT_PAYLOAD_CORRUPT',
      message: 'Import payload could not be decoded as UTF-8.',
      validationLayer: TEST_RICH_CONTENT_VALIDATION_LAYERS.JSON_PARSE,
    };
  }

  try {
    const parsed = JSON.parse(text);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return {
        ok: false,
        code: 'IMPORT_PAYLOAD_INVALID',
        message: 'Import payload must be a JSON object.',
        validationLayer: TEST_RICH_CONTENT_VALIDATION_LAYERS.JSON_PARSE,
      };
    }
    return { ok: true, parsed };
  } catch {
    return {
      ok: false,
      code: 'IMPORT_PAYLOAD_CORRUPT',
      message: 'Import payload is not valid JSON.',
      validationLayer: TEST_RICH_CONTENT_VALIDATION_LAYERS.JSON_PARSE,
    };
  }
}

/**
 * @param {unknown} parsed
 * @returns {{ ok: true, package: import('zod').infer<typeof richContentExportPackageSchema> } | { ok: false, code: string, message: string, validationLayer: string, details?: unknown[] }}
 */
export function validateRichContentPackageStructure(parsed) {
  const result = richContentExportPackageSchema.safeParse(parsed);
  if (!result.success) {
    const issue = result.error.issues[0];
    const path = Array.isArray(issue?.path) ? issue.path.join('.') : '';
    return {
      ok: false,
      code: 'IMPORT_STRUCTURE_INVALID',
      message: path ? `Invalid import structure at ${path}: ${issue.message}` : issue?.message ?? 'Invalid import structure.',
      validationLayer: TEST_RICH_CONTENT_VALIDATION_LAYERS.SCHEMA,
      details: result.error.issues.slice(0, 20).map((i) => ({
        path: i.path,
        message: i.message,
      })),
    };
  }
  return { ok: true, package: result.data };
}

/**
 * @param {import('../validators/testRichContentImport.schema.js').richContentExportPackageSchema extends import('zod').ZodType<infer T> ? T : never} pkg
 * @param {number} courseId
 * @returns {{
 *   ok: true,
 *   preparedQuestions: Array<Record<string, unknown>>,
 * } | {
 *   ok: false,
 *   code: string,
 *   message: string,
 *   validationLayer: string,
 *   questionIndex?: number,
 *   details?: unknown[],
 * }}
 */
export function validateRichContentQuestions(pkg, courseId) {
  const preparedQuestions = [];
  const details = [];

  for (let index = 0; index < pkg.questions.length; index += 1) {
    const question = pkg.questions[index];
    const normalized = normalizeImportQuestionRichFields(question);

    // Determine question type: check if imported question has a type specified, otherwise use PHASE_1
    const importedQuestionType = String(question.question_type ?? '').toLowerCase().trim();
    const questionType = importedQuestionType === 'short' ? 'short' : PHASE_1_QUESTION_TYPE;

    // For short-answer questions, validate the question text but skip options validation
    if (questionType === 'short') {
      if (!normalized.question_text || !String(normalized.question_text).trim()) {
        details.push({
          questionIndex: index + 1,
          code: 'QUESTION_TEXT_REQUIRED',
          message: 'Question text is required',
          validationLayer: 'BUSINESS_RULES',
        });
        continue;
      }

      preparedQuestions.push({
        display_order: question.display_order,
        marks_override: question.marks_override ?? null,
        prepared: attachRichHtmlMirrorFields({
          ...normalized,
          question_text: normalized.question_text,
          question_type: 'short',
          options: [],
        }),
      });
      continue;
    }

    // For MCQ questions, apply full validation
    const writePayload = {
      course_id: courseId,
      subject_id: null,
      topic: normalized.topic ?? null,
      difficulty: normalized.difficulty ?? null,
      question_type: PHASE_1_QUESTION_TYPE,
      question_text: normalized.question_text,
      question_image_url: normalized.question_image_url ?? null,
      explanation: normalized.explanation ?? null,
      marks: normalized.marks,
      options: normalized.options,
    };

    const validation = validateQuestionWritePayload(writePayload);
    if (!validation.ok) {
      details.push({
        questionIndex: index + 1,
        code: validation.code,
        message: validation.message,
        validationLayer: validation.validationLayer,
      });
      continue;
    }

    preparedQuestions.push({
      display_order: question.display_order,
      marks_override: question.marks_override ?? null,
      prepared: attachRichHtmlMirrorFields(validation.payload),
    });
  }

  if (details.length > 0) {
    const first = details[0];
    return {
      ok: false,
      code: first.code,
      message: `Question ${first.questionIndex}: ${first.message}`,
      validationLayer: first.validationLayer,
      questionIndex: first.questionIndex,
      details,
    };
  }

  return { ok: true, preparedQuestions };
}

/**
 * Full import validation pipeline.
 *
 * @param {string|Buffer|Uint8Array|Record<string, unknown>} rawPayload
 * @param {number} courseId
 */
export function validateRichContentImportPayload(rawPayload, courseId) {
  const parsedResult = parseImportJsonPayload(rawPayload);
  if (!parsedResult.ok) {
    return parsedResult;
  }

  const normalizedPayload = normalizeExportJsonForImport(parsedResult.parsed);

  const structureResult = validateRichContentPackageStructure(normalizedPayload);
  if (!structureResult.ok) {
    return structureResult;
  }

  const cid = Number(courseId);
  if (!Number.isInteger(cid) || cid <= 0) {
    return {
      ok: false,
      code: 'COURSE_ID_INVALID',
      message: 'course_id must be a positive integer.',
      validationLayer: TEST_RICH_CONTENT_VALIDATION_LAYERS.SCHEMA,
    };
  }

  const questionsResult = validateRichContentQuestions(structureResult.package, cid);
  if (!questionsResult.ok) {
    return questionsResult;
  }

  return {
    ok: true,
    package: structureResult.package,
    preparedQuestions: questionsResult.preparedQuestions,
  };
}

/**
 * @param {ReturnType<typeof validateRichContentImportPayload>} result
 */
export function throwFromRichContentValidation(result) {
  if (result.ok) return;
  throw new ApiError(422, result.message, {
    code: result.code,
    validationLayer: result.validationLayer,
    questionIndex: result.questionIndex ?? null,
    details: result.details ?? null,
  });
}

/**
 * @param {string|Buffer|Uint8Array|Record<string, unknown>} rawPayload
 * @param {number} courseId
 */
export function assertRichContentImportValid(rawPayload, courseId) {
  const result = validateRichContentImportPayload(rawPayload, courseId);
  throwFromRichContentValidation(result);
  return result;
}

/**
 * Validate supported schema version before structure parsing.
 *
 * @param {Record<string, unknown>} parsed
 */
export function validateImportSchemaVersion(parsed) {
  const version = parsed.version ?? parsed.format_version;
  const format = parsed.format;

  const supported =
    version === TEST_EXPORT_JSON_VERSION ||
    version === '1.0' ||
    version === 1 ||
    format === 'mrb_test_rich_v1';

  if (!supported) {
    return {
      ok: false,
      code: 'UNSUPPORTED_SCHEMA_VERSION',
      message: `Unsupported import schema version "${version ?? 'unknown'}". Expected ${TEST_EXPORT_JSON_VERSION}.`,
      validationLayer: TEST_RICH_CONTENT_VALIDATION_LAYERS.SCHEMA_VERSION,
    };
  }

  return { ok: true };
}

/**
 * Parse uploaded file content by format (json | csv | zip | auto).
 *
 * @param {string} rawContent
 * @param {'json'|'csv'|'zip'|'auto'} [formatHint]
 */
export async function parseTestImportFile(rawContent, formatHint = 'auto') {
  const normalizedHint = String(formatHint ?? 'auto').trim().toLowerCase();
  const isZip =
    normalizedHint === TEST_EXPORT_FORMATS.ZIP ||
    normalizedHint === 'zip' ||
    (normalizedHint === 'auto' && isLikelyZipImportContent(rawContent));

  if (isZip) {
    if (String(rawContent ?? '').length > MAX_IMPORT_ZIP_BASE64_LENGTH) {
      return {
        ok: false,
        code: 'ZIP_TOO_LARGE',
        message: `ZIP import exceeds maximum encoded size (${MAX_IMPORT_ZIP_BASE64_LENGTH} characters).`,
        validationLayer: TEST_RICH_CONTENT_VALIDATION_LAYERS.PAYLOAD_SIZE,
        format: 'zip',
      };
    }

    const decoded = decodeZipImportContent(rawContent);
    if (!decoded.ok) {
      return { ...decoded, format: 'zip' };
    }

    const zipResult = await parseTestImportZip(decoded.buffer);
    if (!zipResult.ok) {
      return zipResult;
    }

    return {
      ok: true,
      format: 'zip',
      package: zipResult.package,
      imageFiles: zipResult.imageFiles,
      mediaIssues: zipResult.mediaIssues ?? [],
    };
  }

  const sizeCheck = validateImportPayloadSize(rawContent);
  if (!sizeCheck.ok) {
    return sizeCheck;
  }

  let format = normalizedHint;
  if (format === 'auto' || !format) {
    format = detectTestImportFormat(rawContent);
  }

  if (!format) {
    return {
      ok: false,
      code: 'IMPORT_FORMAT_UNKNOWN',
      message: 'Could not detect import format. Upload a JSON, CSV, or ZIP test export file.',
      validationLayer: TEST_RICH_CONTENT_VALIDATION_LAYERS.PAYLOAD_SIZE,
    };
  }

  if (format === TEST_EXPORT_FORMATS.CSV || format === 'csv') {
    const csvResult = parseTestImportCsv(rawContent);
    if (!csvResult.ok) {
      return {
        ...csvResult,
        validationLayer: TEST_RICH_CONTENT_VALIDATION_LAYERS.CSV_PARSE,
        format: 'csv',
      };
    }
    return { ok: true, format: 'csv', package: csvResult.package };
  }

  const jsonResult = parseImportJsonPayload(rawContent);
  if (!jsonResult.ok) {
    return { ...jsonResult, format: 'json' };
  }

  const versionCheck = validateImportSchemaVersion(jsonResult.parsed);
  if (!versionCheck.ok) {
    return { ...versionCheck, format: 'json' };
  }

  return { ok: true, format: 'json', package: jsonResult.parsed };
}

/**
 * Collect all validation diagnostics (structure, HTML security, duplicates, answers).
 *
 * @param {Record<string, unknown>} rawPackage
 * @param {number} courseId
 */
export function validateTestImportWithDiagnostics(rawPackage, courseId) {
  /** @type {Array<{ severity: 'error'|'warning', code: string, message: string, questionIndex?: number|null, validationLayer: string }>} */
  const issues = [];

  const allowArchivePaths = Boolean(rawPackage?.media_bundle);

  const normalizedPayload = normalizeExportJsonForImport(rawPackage);
  const versionCheck = validateImportSchemaVersion(normalizedPayload);
  if (!versionCheck.ok) {
    issues.push({
      severity: 'error',
      code: versionCheck.code,
      message: versionCheck.message,
      validationLayer: versionCheck.validationLayer,
    });
    return { valid: false, issues, package: null, preparedQuestions: [] };
  }

  const structureResult = validateRichContentPackageStructure(normalizedPayload);
  if (!structureResult.ok) {
    issues.push({
      severity: 'error',
      code: structureResult.code,
      message: structureResult.message,
      validationLayer: structureResult.validationLayer,
    });
    if (Array.isArray(structureResult.details)) {
      for (const detail of structureResult.details.slice(0, 10)) {
        issues.push({
          severity: 'error',
          code: 'IMPORT_STRUCTURE_INVALID',
          message: `${Array.isArray(detail.path) ? detail.path.join('.') : 'field'}: ${detail.message}`,
          validationLayer: TEST_RICH_CONTENT_VALIDATION_LAYERS.SCHEMA,
        });
      }
    }
    return { valid: false, issues, package: null, preparedQuestions: [] };
  }

  const pkg = structureResult.package;
  const cid = Number(courseId);
  if (!Number.isInteger(cid) || cid <= 0) {
    issues.push({
      severity: 'error',
      code: 'COURSE_ID_INVALID',
      message: 'course_id must be a positive integer.',
      validationLayer: TEST_RICH_CONTENT_VALIDATION_LAYERS.SCHEMA,
    });
    return { valid: false, issues, package: pkg, preparedQuestions: [] };
  }

  const duplicates = detectDuplicateQuestionsInImport(pkg.questions);
  for (const dup of duplicates) {
    issues.push({
      severity: 'error',
      code: dup.kind,
      message: dup.message,
      questionIndex: dup.questionIndex,
      validationLayer: TEST_RICH_CONTENT_VALIDATION_LAYERS.DUPLICATE,
    });
  }

  /** @type {Array<Record<string, unknown>>} */
  const preparedQuestions = [];

  for (let index = 0; index < pkg.questions.length; index += 1) {
    const question = pkg.questions[index];
    const normalized = normalizeImportQuestionRichFields(question);

    const writePayload = {
      course_id: cid,
      subject_id: null,
      topic: normalized.topic ?? null,
      difficulty: normalized.difficulty ?? null,
      question_type: PHASE_1_QUESTION_TYPE,
      question_text: normalized.question_text,
      question_image_url: normalized.question_image_url ?? null,
      explanation: normalized.explanation ?? null,
      marks: normalized.marks,
      options: normalized.options,
    };

    const validation = validateQuestionWritePayload(writePayload, { allowArchivePaths });
    if (!validation.ok) {
      issues.push({
        severity: 'error',
        code: validation.code,
        message: validation.message,
        questionIndex: index + 1,
        validationLayer: validation.validationLayer,
      });
      continue;
    }

    preparedQuestions.push({
      display_order: question.display_order,
      marks_override: question.marks_override ?? null,
      prepared: attachRichHtmlMirrorFields(validation.payload),
    });
  }

  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const valid = errorCount === 0 && preparedQuestions.length === pkg.questions.length;

  return {
    valid,
    issues,
    package: pkg,
    preparedQuestions: valid ? preparedQuestions : [],
    summary: {
      question_count: pkg.questions.length,
      error_count: errorCount,
      warning_count: issues.filter((i) => i.severity === 'warning').length,
      title: pkg.test?.title ?? null,
      subject_ids: pkg.subject_ids ?? [],
    },
  };
}

/**
 * Full wizard validation: parse file + run diagnostics.
 *
 * @param {string} rawContent
 * @param {number} courseId
 * @param {'json'|'csv'|'zip'|'auto'} [formatHint]
 */
export async function validateTestImportFile(rawContent, courseId, formatHint = 'auto') {
  const parsed = await parseTestImportFile(rawContent, formatHint);
  if (!parsed.ok) {
    const baseIssues = [
      {
        severity: 'error',
        code: parsed.code,
        message: parsed.message,
        validationLayer: parsed.validationLayer ?? TEST_RICH_CONTENT_VALIDATION_LAYERS.PAYLOAD_SIZE,
      },
    ];
    return {
      valid: false,
      format: parsed.format ?? formatHint,
      issues: Array.isArray(parsed.issues) ? parsed.issues : baseIssues,
      package: null,
      preparedQuestions: [],
      imageFiles: null,
    };
  }

  const diagnostics = validateTestImportWithDiagnostics(parsed.package, courseId);
  const mediaWarnings = Array.isArray(parsed.mediaIssues) ? parsed.mediaIssues : [];
  return {
    ...diagnostics,
    format: parsed.format,
    imageFiles: parsed.imageFiles ?? null,
    issues: [...(diagnostics.issues ?? []), ...mediaWarnings],
  };
}
