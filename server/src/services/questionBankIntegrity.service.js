import { ApiError } from '../utils/apiError.js';
import { MCQ_OPTION_KEYS, validateOptions } from '../validators/questionOptions.validation.js';
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
export function validateQuestionIntegrity(question, options, { questionId = null, operation = 'create' } = {}) {
  if (typeof question !== 'object' || question === null) {
    throw integrityError('question payload must be an object', 'INVALID_QUESTION_SHAPE', { operation, questionId });
  }

  const questionText = String(question.question_text ?? question.questionText ?? '').trim();
  if (!questionText) {
    throw integrityError('question_text is required', 'INVALID_QUESTION_TEXT', { operation, questionId });
  }

  const marks = Number(question.marks);
  if (!Number.isFinite(marks) || marks <= 0) {
    throw integrityError('marks must be greater than 0', 'INVALID_MARKS', { operation, questionId });
  }

  const courseIdRaw = question.course_id ?? question.courseId;
  if (courseIdRaw != null) {
    const courseId = Number(courseIdRaw);
    if (!Number.isFinite(courseId) || courseId <= 0) {
      throw integrityError('course_id must be a positive number', 'INVALID_COURSE_ID', { operation, questionId });
    }
  }

  let normalizedOptions;
  try {
    normalizedOptions = validateOptions(options);
  } catch (error) {
    if (error instanceof ApiError) {
      logValidationFailure({
        code: error.code,
        message: error.message,
        operation,
        questionId,
      });
    }
    throw error;
  }

  return {
    question: {
      question_text: questionText,
      marks,
      course_id: courseIdRaw != null ? Number(courseIdRaw) : undefined,
    },
    options: normalizedOptions,
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

  if (optionRows.length !== MCQ_OPTION_KEYS.length) {
    errors.push({
      code: 'INVALID_PERSISTED_OPTION_COUNT',
      message: `Expected ${MCQ_OPTION_KEYS.length} options, found ${optionRows.length}`,
    });
  }

  const keys = optionRows.map((row) => String(row.option_key ?? '').toUpperCase());
  const uniqueKeys = new Set(keys);
  if (uniqueKeys.size !== optionRows.length) {
    errors.push({ code: 'DUPLICATE_PERSISTED_OPTION_KEY', message: 'Duplicate option_key rows detected' });
  }

  for (const requiredKey of MCQ_OPTION_KEYS) {
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
