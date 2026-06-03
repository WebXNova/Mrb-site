import { mysqlPool } from '../config/mysql.js';
import { ApiError } from '../utils/apiError.js';
import { getCourseRowById } from './courseCatalogQueries.service.js';
import { logActivity } from './activityLog.service.js';
import { toQuestionBankDto, toQuestionSoftDeleteResultDto } from '../dto/question.dto.js';
import { toQuestionListResponse } from '../dto/questionList.dto.js';
import { MAX_MCQ_OPTIONS, PHASE_1_QUESTION_TYPE } from '../validators/questionWrite.schema.js';
import {
  activeQuestionByIdLookup,
  buildActiveQuestionListQuery,
  buildQuestionListFilters,
} from './questionBankQueries.service.js';
import {
  InvalidQuestionIdError,
  QuestionBankInternalError,
  QuestionNotFoundError,
} from '../errors/questionBank/QuestionBankErrors.js';
import { AppError } from '../errors/base/AppError.js';

const LOG_PREFIX = '[question-bank]';

function courseNotFound() {
  return new ApiError(404, 'Course not found', { code: 'COURSE_NOT_FOUND' });
}

function subjectNotFound() {
  return new ApiError(404, 'Subject not found for this course', { code: 'SUBJECT_NOT_FOUND' });
}

function invalidMcqPayload(message, code) {
  return new ApiError(422, message, { code });
}

function questionNotFound(metadata = null) {
  return new QuestionNotFoundError(metadata);
}

function isDomainError(error) {
  return error instanceof AppError || error instanceof ApiError;
}

function parsePositiveQuestionId(questionId) {
  const id = Number(questionId);
  if (!Number.isFinite(id) || id <= 0) {
    throw new InvalidQuestionIdError({ questionId });
  }
  return id;
}

function parsePositiveAdminId(adminId) {
  const id = Number(adminId);
  if (!Number.isFinite(id) || id <= 0) {
    throw new ApiError(401, 'Authenticated admin required', { code: 'UNAUTHORIZED' });
  }
  return id;
}

/**
 * Server-side MCQ integrity checks — never trust client validation alone.
 * @param {{ question_text: string, marks: number, options: Array<{ option_text: string, is_correct: boolean }>, question_type?: string }} payload
 * @param {{ maxOptions?: number }} [opts]
 */
export function assertMcqBusinessRules(payload, { maxOptions = MAX_MCQ_OPTIONS } = {}) {
  if (!payload.question_text || String(payload.question_text).trim() === '') {
    throw invalidMcqPayload('question_text is required', 'INVALID_QUESTION_TEXT');
  }

  if (!Number.isFinite(payload.marks) || payload.marks <= 0) {
    throw invalidMcqPayload('marks must be greater than 0', 'INVALID_MARKS');
  }

  const options = Array.isArray(payload.options) ? payload.options : [];
  if (options.length < 2) {
    throw invalidMcqPayload('At least 2 options are required', 'INSUFFICIENT_OPTIONS');
  }

  if (options.length > maxOptions) {
    throw invalidMcqPayload(`At most ${maxOptions} options are allowed`, 'TOO_MANY_OPTIONS');
  }

  for (const opt of options) {
    if (!opt.option_text || String(opt.option_text).trim() === '') {
      throw invalidMcqPayload('Each option must have non-empty option_text', 'INVALID_OPTION_TEXT');
    }
  }

  const correctCount = options.filter((opt) => Boolean(opt.is_correct)).length;
  if (correctCount === 0) {
    throw invalidMcqPayload('Exactly one option must be marked as correct', 'NO_CORRECT_OPTION');
  }
  if (correctCount > 1) {
    throw invalidMcqPayload('Only one option may be marked as correct', 'MULTIPLE_CORRECT_OPTIONS');
  }
}

/**
 * Phase 1 write guard — reject tf/essay until dedicated validators exist.
 * Future: branch to assertTfBusinessRules / assertEssayBusinessRules when FUTURE_QUESTION_TYPES ship.
 *
 * @param {string|undefined|null} questionType
 */
export function assertPhase1QuestionTypeSupported(questionType) {
  const normalized = String(questionType ?? PHASE_1_QUESTION_TYPE).trim().toLowerCase();
  if (normalized !== PHASE_1_QUESTION_TYPE) {
    throw invalidMcqPayload(
      'Phase 1 supports MCQ questions only. question_type must be "mcq".',
      'UNSUPPORTED_QUESTION_TYPE'
    );
  }
}

/**
 * @param {{ question_type?: string, question_text: string, marks: number, options?: Array<{ option_text: string, is_correct: boolean }> }} payload
 */
export function assertQuestionWriteBusinessRules(payload) {
  assertPhase1QuestionTypeSupported(payload.question_type);
  assertMcqBusinessRules({ ...payload, question_type: PHASE_1_QUESTION_TYPE, options: payload.options ?? [] });
}

async function assertCourseExists(courseId) {
  const row = await getCourseRowById(courseId);
  if (!row) throw courseNotFound();
}

async function assertSubjectBelongsToCourse(subjectId, courseId, connection = mysqlPool) {
  const [rows] = await connection.query(
    `SELECT id FROM subjects WHERE id = ? AND course_id = ? LIMIT 1`,
    [subjectId, courseId]
  );
  if (!rows.length) throw subjectNotFound();
}

async function fetchQuestionWithOptions(questionId, connection = mysqlPool) {
  const { sql, params } = activeQuestionByIdLookup(questionId);
  const [questionRows] = await connection.query(sql, params);
  const question = questionRows[0];
  if (!question) {
    throw questionNotFound({ questionId });
  }

  const [optionRows] = await connection.query(
    `SELECT id, question_id, option_text, is_correct, sort_order, created_at, updated_at
     FROM question_options
     WHERE question_id = ?
     ORDER BY sort_order ASC, id ASC`,
    [questionId]
  );

  return toQuestionBankDto(question, optionRows);
}

async function insertQuestionOptions(connection, questionId, options) {
  for (let index = 0; index < options.length; index += 1) {
    const option = options[index];
    const sortOrder = option.sort_order != null ? option.sort_order : index;

    await connection.query(
      `INSERT INTO question_options (question_id, option_text, is_correct, sort_order)
       VALUES (?, ?, ?, ?)`,
      [questionId, option.option_text.trim(), option.is_correct ? 1 : 0, sortOrder]
    );
  }
}

async function lockActiveQuestionRow(connection, questionId) {
  const [rows] = await connection.query(
    `SELECT id, created_by, deleted_at, deleted_by
     FROM question_bank
     WHERE id = ?
     LIMIT 1
     FOR UPDATE`,
    [questionId]
  );
  const row = rows[0];
  if (!row) {
    throw questionNotFound({ questionId });
  }
  if (row.deleted_at != null) {
    throw questionNotFound({ questionId, reason: 'already_deleted' });
  }
  return row;
}

async function fetchSoftDeletedQuestionRow(connection, questionId) {
  const [rows] = await connection.query(
    `SELECT id, deleted_at, deleted_by, updated_at
     FROM question_bank
     WHERE id = ? AND deleted_at IS NOT NULL
     LIMIT 1`,
    [questionId]
  );
  const row = rows[0];
  if (!row) {
    throw questionNotFound({ questionId });
  }
  return toQuestionSoftDeleteResultDto(row);
}

/**
 * Create an MCQ question and its options atomically.
 * @param {{
 *   course_id: number,
 *   subject_id?: number|null,
 *   topic?: string|null,
 *   difficulty?: string|null,
 *   question_type?: string,
 *   question_text: string,
 *   marks: number,
 *   explanation?: string|null,
 *   options: Array<{ option_text: string, is_correct: boolean, sort_order?: number }>
 * }} payload
 * @param {number} createdBy
 */
export async function createMcqQuestion(payload, createdBy) {
  assertQuestionWriteBusinessRules({ ...payload, question_type: payload.question_type ?? 'mcq' });

  if (!Number.isFinite(createdBy) || createdBy <= 0) {
    throw new ApiError(401, 'Authenticated admin required', { code: 'UNAUTHORIZED' });
  }

  await assertCourseExists(payload.course_id);

  const connection = await mysqlPool.getConnection();
  try {
    console.info(`${LOG_PREFIX} transaction started`, {
      course_id: payload.course_id,
      option_count: payload.options.length,
      created_by: createdBy,
    });

    await connection.beginTransaction();

    if (payload.subject_id != null) {
      await assertSubjectBelongsToCourse(payload.subject_id, payload.course_id, connection);
    }

    const [insertResult] = await connection.query(
      `INSERT INTO question_bank
         (course_id, subject_id, topic, difficulty, question_type, question_text, explanation, marks, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        payload.course_id,
        payload.subject_id ?? null,
        payload.topic ?? null,
        payload.difficulty ?? null,
        PHASE_1_QUESTION_TYPE,
        payload.question_text.trim(),
        payload.explanation ?? null,
        payload.marks,
        createdBy,
      ]
    );

    const questionId = Number(insertResult.insertId);
    if (!Number.isFinite(questionId) || questionId <= 0) {
      throw new ApiError(500, 'Question insert did not return a valid id', {
        code: 'QUESTION_INSERT_FAILED',
      });
    }

    console.info(`${LOG_PREFIX} question inserted`, { question_id: questionId });

    await insertQuestionOptions(connection, questionId, payload.options);

    console.info(`${LOG_PREFIX} options inserted`, {
      question_id: questionId,
      count: payload.options.length,
    });

    const created = await fetchQuestionWithOptions(questionId, connection);
    await connection.commit();
    console.info(`${LOG_PREFIX} commit completed`, { question_id: questionId });
    return created;
  } catch (error) {
    console.error(`${LOG_PREFIX} transaction failed — rolling back`, {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      code: error?.code,
      errno: error?.errno,
      sqlMessage: error?.sqlMessage,
    });
    try {
      await connection.rollback();
      console.info(`${LOG_PREFIX} rollback completed`);
    } catch (rollbackError) {
      console.error(`${LOG_PREFIX} rollback failed`, {
        message: rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
        stack: rollbackError instanceof Error ? rollbackError.stack : undefined,
      });
    }
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Update an existing question and replace its options atomically.
 * @param {number} questionId
 * @param {{
 *   course_id: number,
 *   subject_id?: number|null,
 *   topic?: string|null,
 *   difficulty?: string|null,
 *   question_type: string,
 *   question_text: string,
 *   marks: number,
 *   explanation?: string|null,
 *   options?: Array<{ option_text: string, is_correct: boolean, sort_order?: number }>
 * }} payload
 * @param {number} adminId
 * @param {string} [adminRole]
 */
export async function updateQuestion(questionId, payload, adminId, adminRole = 'admin') {
  const id = parsePositiveQuestionId(questionId);

  if (!Number.isFinite(adminId) || adminId <= 0) {
    throw new ApiError(401, 'Authenticated admin required', { code: 'UNAUTHORIZED' });
  }

  assertQuestionWriteBusinessRules(payload);

  const connection = await mysqlPool.getConnection();
  try {
    console.info(`${LOG_PREFIX} update transaction started`, {
      question_id: id,
      admin_id: adminId,
      question_type: payload.question_type,
    });

    await connection.beginTransaction();

    await lockActiveQuestionRow(connection, id);

    await assertCourseExists(payload.course_id);

    if (payload.subject_id != null) {
      await assertSubjectBelongsToCourse(payload.subject_id, payload.course_id, connection);
    }

    const [updateResult] = await connection.query(
      `UPDATE question_bank
       SET course_id = ?,
           subject_id = ?,
           topic = ?,
           difficulty = ?,
           question_type = ?,
           question_text = ?,
           explanation = ?,
           marks = ?
       WHERE id = ? AND deleted_at IS NULL`,
      [
        payload.course_id,
        payload.subject_id ?? null,
        payload.topic ?? null,
        payload.difficulty ?? null,
        PHASE_1_QUESTION_TYPE,
        payload.question_text.trim(),
        payload.explanation ?? null,
        payload.marks,
        id,
      ]
    );

    if (Number(updateResult.affectedRows) !== 1) {
      throw questionNotFound();
    }

    await connection.query(`DELETE FROM question_options WHERE question_id = ?`, [id]);
    await insertQuestionOptions(connection, id, payload.options);

    const updated = await fetchQuestionWithOptions(id, connection);

    await connection.commit();
    console.info(`${LOG_PREFIX} update commit completed`, { question_id: id });

    try {
      await logActivity({
        userId: adminId,
        role: adminRole,
        action: 'admin.question.update',
        entityType: 'question_bank',
        entityId: String(id),
        metadata: {
          event: 'QUESTION_UPDATED',
          questionId: id,
          adminId,
          courseId: payload.course_id,
          subjectId: payload.subject_id ?? null,
          questionType: payload.question_type,
        },
      });
    } catch (activityError) {
      console.error(`${LOG_PREFIX} activity log failed after successful update commit`, {
        question_id: id,
        message: activityError instanceof Error ? activityError.message : String(activityError),
        stack: activityError instanceof Error ? activityError.stack : undefined,
      });
    }

    return updated;
  } catch (error) {
    console.error(`${LOG_PREFIX} update transaction failed — rolling back`, {
      question_id: id,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      code: error?.code,
      errno: error?.errno,
      sqlMessage: error?.sqlMessage,
    });
    try {
      await connection.rollback();
      console.info(`${LOG_PREFIX} update rollback completed`, { question_id: id });
    } catch (rollbackError) {
      console.error(`${LOG_PREFIX} update rollback failed`, {
        question_id: id,
        message: rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
        stack: rollbackError instanceof Error ? rollbackError.stack : undefined,
      });
    }
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Soft-delete a question atomically with row-level locking.
 *
 * @param {number|string} questionId
 * @param {number|string} adminId
 * @returns {Promise<{ question_id: number, deleted_at: string|null, deleted_by: number|null }>}
 */
export async function deleteQuestion(questionId, adminId) {
  const id = parsePositiveQuestionId(questionId);
  const admin = parsePositiveAdminId(adminId);

  const connection = await mysqlPool.getConnection();
  try {
    console.info(`${LOG_PREFIX} soft-delete transaction started`, {
      question_id: id,
      admin_id: admin,
    });

    await connection.beginTransaction();

    await lockActiveQuestionRow(connection, id);

    const [updateResult] = await connection.query(
      `UPDATE question_bank
       SET deleted_at = CURRENT_TIMESTAMP,
           deleted_by = ?
       WHERE id = ?
         AND deleted_at IS NULL`,
      [admin, id]
    );

    if (Number(updateResult.affectedRows) !== 1) {
      throw questionNotFound({ questionId: id, reason: 'concurrent_delete_or_missing' });
    }

    const result = await fetchSoftDeletedQuestionRow(connection, id);

    await connection.commit();
    console.info(`${LOG_PREFIX} soft-delete commit completed`, {
      question_id: id,
      deleted_by: admin,
    });
    return result;
  } catch (error) {
    console.error(`${LOG_PREFIX} soft-delete transaction failed — rolling back`, {
      question_id: id,
      admin_id: admin,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    try {
      await connection.rollback();
      console.info(`${LOG_PREFIX} soft-delete rollback completed`, { question_id: id });
    } catch (rollbackError) {
      console.error(`${LOG_PREFIX} soft-delete rollback failed`, {
        question_id: id,
        message: rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
      });
    }

    if (isDomainError(error)) {
      throw error;
    }

    throw new QuestionBankInternalError({ questionId: id, operation: 'soft_delete' }, error);
  } finally {
    connection.release();
  }
}

export async function listQuestions(filters) {
  const page = filters.page;
  const limit = filters.limit;
  const offset = (page - 1) * limit;

  const filterResult = buildQuestionListFilters(filters);
  const { countSql, countParams, listSql, listParams } = buildActiveQuestionListQuery(filterResult, {
    limit,
    offset,
  });

  const [[countRow]] = await mysqlPool.query(countSql, countParams);
  const total = Number(countRow?.total ?? 0);
  const [rows] = await mysqlPool.query(listSql, listParams);

  console.info(`${LOG_PREFIX} list completed`, {
    page,
    limit,
    total,
    returned: rows.length,
  });

  return toQuestionListResponse(rows, { page, limit, total });
}

export async function getQuestionById(questionId) {
  const id = parsePositiveQuestionId(questionId);

  console.info(`${LOG_PREFIX} fetching question`, { question_id: id });
  return fetchQuestionWithOptions(id);
}
