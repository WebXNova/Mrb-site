import { validateAikenQuestions } from './aikenValidator.js';

import { validateQuestionWritePayload } from './questionWritePrepare.service.js';

import {
  AIKEN_IMPORT_VALIDATION_LAYERS,
  buildAikenImportDiagnostic,
} from './aikenImportDiagnostics.js';

import { validateQuestionMarks, DEFAULT_QUESTION_MARKS } from '../validators/questionMarks.validation.js';
import { normalizeDuplicatePolicy } from './questionImportDuplicateDetection.service.js';

/**
 * Default import context for content-only preview (schema shape).
 * FK checks (course/subject existence) still run only at DB import time.
 */
export const AIKEN_DEFAULT_IMPORT_CONTEXT = Object.freeze({
  course_id: 1,
  subject_id: null,
  topic: null,
  difficulty: null,
  marks: DEFAULT_QUESTION_MARKS,
});

/**
 * @typedef {{
 *   course_id: number,
 *   subject_id?: number | null,
 *   topic?: string | null,
 *   difficulty?: string | null,
 *   marks?: number,
 *   duplicate_policy?: string,
 *   duplicate_check_enabled?: boolean,
 * }} AikenImportValidationContext
 *
 * @typedef {ReturnType<typeof buildAikenImportDiagnostic>} AikenImportValidationError
 *
 * @typedef {{
 *   questionNumber: number,
 *   aikenQuestion: import('./aikenValidator.js').AikenValidatorQuestion,
 *   writePayload: Record<string, unknown>,
 * }} AikenImportReadyItem
 */

/**
 * @param {import('./aikenValidator.js').AikenValidatorQuestion} question
 * @param {AikenImportValidationContext} context
 */
export function mapAikenQuestionToCreatePayload(question, context) {
  return {
    course_id: context.course_id,
    subject_id: context.subject_id ?? null,
    topic: context.topic ?? null,
    difficulty: context.difficulty ?? null,
    question_type: 'mcq',
    question_text: question.question_text,
    explanation: question.explanation ?? null,
    question_image_url: null,
    marks: context.marks ?? 1,
    options: question.options.map((option) => ({
      option_key: option.key,
      option_text: option.text,
      is_correct: option.key === question.correctAnswer,
      image_url: null,
    })),
  };
}

/**
 * @param {unknown} raw
 * @param {{ previewMode?: boolean }} [options]
 * @returns {AikenImportValidationContext}
 */
export function normalizeAikenImportValidationContext(raw, options = {}) {
  const body = typeof raw === 'object' && raw !== null ? raw : {};
  const previewMode = Boolean(options.previewMode);
  const courseIdProvided =
    (body.course_id != null && body.course_id !== '') ||
    (body.courseId != null && body.courseId !== '');

  const courseId = Number(body.course_id ?? body.courseId ?? AIKEN_DEFAULT_IMPORT_CONTEXT.course_id);

  const marksValidation = validateQuestionMarks(body.marks, {
    defaultWhenMissing: true,
  });

  return {
    course_id: courseId,
    subject_id: body.subject_id ?? body.subjectId ?? null,
    topic: body.topic ?? null,
    difficulty: body.difficulty ?? null,
    marks: marksValidation.ok ? marksValidation.marks : DEFAULT_QUESTION_MARKS,
    duplicate_policy: normalizeDuplicatePolicy(body.duplicate_policy ?? body.duplicatePolicy),
    duplicate_check_enabled: courseIdProvided || !previewMode,
  };
}

/**
 * @param {import('./aikenParser.js').AikenParsedQuestion[]} parsedQuestions
 * @param {number} index
 */
function questionTitleAtIndex(parsedQuestions, index) {
  return parsedQuestions[index]?.question_text ?? null;
}

/**
 * Run the full Aiken → write-payload validation pipeline for every parsed question.
 *
 * @param {import('./aikenParser.js').AikenParsedQuestion[]} parsedQuestions
 * @param {AikenImportValidationContext} importContext
 * @param {{ questionNumbers?: number[] }} [options]
 */
export function partitionParsedAikenForImport(parsedQuestions, importContext, options = {}) {
  const questionNumbers =
    options.questionNumbers ?? parsedQuestions.map((_, index) => index + 1);

  const { validQuestions: aikenValid, invalidQuestions: aikenInvalid } =
    validateAikenQuestions(parsedQuestions);

  /** @type {AikenImportValidationError[]} */
  const errors = [];
  const invalidByIndex = new Map(aikenInvalid.map((entry) => [entry.index, entry]));

  for (const invalid of aikenInvalid) {
    errors.push(
      buildAikenImportDiagnostic({
        questionNumber: questionNumbers[invalid.index] ?? invalid.index + 1,
        questionTitle: questionTitleAtIndex(parsedQuestions, invalid.index),
        errorCode: invalid.code,
        message: invalid.message,
        validationLayer: AIKEN_IMPORT_VALIDATION_LAYERS.AIKEN_VALIDATION,
      })
    );
  }

  /** @type {AikenImportReadyItem[]} */
  const readyItems = [];
  let aikenQueueIndex = 0;

  for (let index = 0; index < parsedQuestions.length; index += 1) {
    if (invalidByIndex.has(index)) {
      continue;
    }

    const aikenQuestion = aikenValid[aikenQueueIndex];
    aikenQueueIndex += 1;
    const questionNumber = questionNumbers[index] ?? index + 1;

    const mappedPayload = mapAikenQuestionToCreatePayload(aikenQuestion, importContext);
    const writeResult = validateQuestionWritePayload(mappedPayload);

    if (!writeResult.ok) {
      errors.push(
        buildAikenImportDiagnostic({
          questionNumber,
          questionTitle: aikenQuestion.question_text,
          errorCode: writeResult.code,
          message: writeResult.message,
          validationLayer: writeResult.validationLayer,
        })
      );
      continue;
    }

    readyItems.push({
      questionNumber,
      aikenQuestion,
      writePayload: writeResult.payload,
    });
  }

  return {
    totalQuestions: parsedQuestions.length,
    validQuestions: readyItems.map((item) => item.aikenQuestion),
    readyItems,
    errors,
  };
}

/**
 * Parse + validate a full document, preserving block question numbers for resilient parse.
 *
 * @param {import('./aikenParser.js').AikenParseDocumentResult} document
 * @param {AikenImportValidationContext} importContext
 */
export function partitionAikenDocumentForImport(document, importContext) {
  /** @type {AikenImportValidationError[]} */
  const parseErrors = document.parseErrors.map((entry) =>
    buildAikenImportDiagnostic({
      questionNumber: entry.questionNumber,
      lineNumber: entry.lineNumber,
      questionTitle: null,
      errorCode: entry.code,
      message: entry.message,
      validationLayer: AIKEN_IMPORT_VALIDATION_LAYERS.AIKEN_PARSE,
    })
  );

  const questionNumbers = document.results
    .filter((entry) => entry.ok)
    .map((entry) => entry.questionNumber);

  const partitioned = partitionParsedAikenForImport(document.questions, importContext, {
    questionNumbers,
  });

  return {
    totalBlocks: document.totalBlocks,
    parsedQuestions: document.questions.length,
    parseErrors,
    ...partitioned,
    errors: [...parseErrors, ...partitioned.errors],
  };
}
