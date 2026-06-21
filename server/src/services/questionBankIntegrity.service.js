import { ApiError } from '../utils/apiError.js';
import { validateQuestionMarks } from '../validators/questionMarks.validation.js';
import {
  MCQ_MAX_OPTIONS,
  MCQ_MIN_OPTIONS,
  MCQ_OPTION_KEY_ALPHABET,
} from '../validation/mcq/mcqValidation.constants.js';
import { assertValidMcqQuestion } from '../validation/mcq/mcqValidation.engine.js';
import { McqValidationError } from '../validation/mcq/McqValidationError.js';
import {
  logPostWriteIntegrityFailure,
  logValidationFailure,
} from './questionBankIntegrityLog.js';

/**
 * Question Bank integrity layer.
 *
 * Anti-corruption rules:
 * - Never allow partial insert (enforced by transaction in write services)
 * - Never allow duplicate correct answers (validateOptions + DB triggers)
 * - Never trust frontend payload (re-validate before commit)
 * - Never auto-fix silently (reject write and log)
 *
 * Repair strategy: REJECT writes on invalid state. Read-path audits may report
 * corruption but must not mutate data without explicit admin repair tooling.
 */

function integrityError(message, code, metadata = {}) {
  const error = new ApiError(422, message, { code, ...metadata });
  logValidationFailure({
    code,
    message,
    ...metadata,
  });
  return error;
}

/**
 * Validate question + options payload before persistence.
 * Does not mutate input — returns normalized options for insert.
 *
 * @param {unknown} question
 * @param {unknown} options
 * @param {{ questionId?: number|null, operation?: 'create'|'update' }} [context]
 * @returns {{
 *   question: {
 *     question_text: string,
 *     marks: number,
 *     course_id?: number,
 *   },
 *   options: Array<{
 *     option_key: string,
 *     option_text: string,
 *     image_url: string|null,
 *     is_correct: boolean,
 *     sort_order: number,
 *   }>,
 * }}
 */
export function validateQuestionIntegrity(question, options, { questionId = null, operation = 'create', allowArchivePaths = false } = {}) {
  if (typeof question !== 'object' || question === null) {
    throw integrityError('question payload must be an object', 'INVALID_QUESTION_SHAPE', { operation, questionId });
  }

  const marksResult = validateQuestionMarks(question.marks, { defaultWhenMissing: false, field: 'marks' });
  if (!marksResult.ok) {
    throw integrityError(marksResult.message, 'INVALID_MARKS', { operation, questionId });
  }
  const marks = marksResult.marks;

  const courseIdRaw = question.course_id ?? question.courseId;
  if (courseIdRaw != null) {
    const courseId = Number(courseIdRaw);
    if (!Number.isFinite(courseId) || courseId <= 0) {
      throw integrityError('course_id must be a positive number', 'INVALID_COURSE_ID', { operation, questionId });
    }
  }

  let normalizedMcq;
  try {
    normalizedMcq = assertValidMcqQuestion(
      {
        question_text: question.question_text ?? question.questionText,
        question_image_url: question.question_image_url ?? question.questionImageUrl,
        options,
      },
      {
        format: 'question_bank',
        context: 'manual_save',
        stripHtml: true,
        questionId,
        allowArchivePaths,
      }
    );
  } catch (error) {
    if (error instanceof McqValidationError || error instanceof ApiError) {
      logValidationFailure({
        code: error.errorCode || error.code,
        message: error.message,
        operation,
        questionId,
      });
    }
    throw error;
  }

  return {
    question: {
      question_text: normalizedMcq.question_text,
      marks,
      course_id: courseIdRaw != null ? Number(courseIdRaw) : undefined,
      question_image_url: normalizedMcq.question_image_url ?? null,
    },
    options: normalizedMcq.options,
  };
}

/**
 * Read-back integrity assertion inside an open transaction.
 * Verifies persisted rows match invariants — rejects commit if corrupt.
 *
 * @param {import('mysql2/promise').PoolConnection} connection
 * @param {number} questionId
 */
export async function assertPersistedQuestionIntegrity(connection, questionId) {
  const [optionRows] = await connection.query(
    `SELECT id, question_id, option_key, option_text, is_correct
     FROM question_options
     WHERE question_id = ?
     ORDER BY sort_order ASC, id ASC`,
    [questionId]
  );

  const [questionRows] = await connection.query(
    `SELECT id FROM question_bank WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
    [questionId]
  );

  if (!questionRows.length) {
    const error = new ApiError(500, 'Question row missing after option write', {
      code: 'QUESTION_ROW_MISSING',
      question_id: questionId,
    });
    logPostWriteIntegrityFailure({
      code: error.code,
      question_id: questionId,
      reason: 'parent_question_missing',
    });
    throw error;
  }

  const errors = [];

  if (optionRows.length < MCQ_MIN_OPTIONS || optionRows.length > MCQ_MAX_OPTIONS) {
    errors.push({
      code: 'INVALID_PERSISTED_OPTION_COUNT',
      message: `Expected ${MCQ_MIN_OPTIONS}-${MCQ_MAX_OPTIONS} options, found ${optionRows.length}`,
    });
  }

  const keys = optionRows.map((row) => String(row.option_key ?? '').toUpperCase());
  const uniqueKeys = new Set(keys);
  if (uniqueKeys.size !== optionRows.length) {
    errors.push({ code: 'DUPLICATE_PERSISTED_OPTION_KEY', message: 'Duplicate option_key rows detected' });
  }

  const expectedKeys = MCQ_OPTION_KEY_ALPHABET.slice(0, optionRows.length);
  for (const requiredKey of expectedKeys) {
    if (!keys.includes(requiredKey)) {
      errors.push({
        code: 'MISSING_PERSISTED_OPTION_KEY',
        message: `Missing persisted option key ${requiredKey}`,
        option_key: requiredKey,
      });
    }
  }

  for (const row of optionRows) {
    if (!String(row.option_text ?? '').trim()) {
      errors.push({
        code: 'EMPTY_PERSISTED_OPTION_TEXT',
        message: `Option ${row.option_key} has empty text`,
        option_id: row.id,
      });
    }
    if (Number(row.question_id) !== Number(questionId)) {
      errors.push({
        code: 'ORPHAN_OPTION_MAPPING',
        message: 'Option question_id does not match parent question',
        option_id: row.id,
        expected_question_id: questionId,
        actual_question_id: row.question_id,
      });
    }
  }

  const correctCount = optionRows.filter((row) => Number(row.is_correct) === 1).length;
  if (correctCount !== 1) {
    errors.push({
      code: 'INVALID_PERSISTED_CORRECT_COUNT',
      message: `Expected exactly one correct option, found ${correctCount}`,
      correct_count: correctCount,
    });
  }

  if (errors.length > 0) {
    logPostWriteIntegrityFailure({
      question_id: questionId,
      errors,
    });
    throw new ApiError(500, 'Persisted question-option integrity check failed', {
      code: 'PERSISTED_INTEGRITY_FAILED',
      question_id: questionId,
      errors,
    });
  }
}
