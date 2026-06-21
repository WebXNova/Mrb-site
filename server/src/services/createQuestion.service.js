import { mysqlPool } from '../config/mysql.js';
import { ApiError } from '../utils/apiError.js';
import { getCourseRowById } from './courseCatalogQueries.service.js';
import { PHASE_1_QUESTION_TYPE } from '../validators/questionWrite.schema.js';
import { assertQuestionWritePayloadValid } from './questionWritePrepare.service.js';
import { assertPersistedQuestionIntegrity } from './questionBankIntegrity.service.js';
import { logTransactionRollback } from './questionBankIntegrityLog.js';
import { toQuestionBankDto } from '../dto/question.dto.js';
import { activeQuestionByIdLookup } from './questionBankQueries.service.js';
import { QuestionNotFoundError } from '../errors/questionBank/QuestionBankErrors.js';

const LOG_PREFIX = '[question-bank:create]';

/**
 * Create Question service — correct-answer persistence entry point.
 *
 * Security invariants (enforced here and in DB):
 * - Frontend correctness is not trusted
 * - Database enforces final consistency (triggers + post-insert assertion)
 * - Partial inserts are forbidden (transaction required)
 */

function courseNotFound() {
  return new ApiError(404, 'Course not found', { code: 'COURSE_NOT_FOUND' });
}

function subjectNotFound() {
  return new ApiError(404, 'Subject not found for this course', { code: 'SUBJECT_NOT_FOUND' });
}

async function assertCourseExists(courseId) {
  const row = await getCourseRowById(courseId);
  if (!row) throw courseNotFound();
}

async function assertSubjectBelongsToCourse(subjectId, courseId, connection) {
  const [rows] = await connection.query(
    `SELECT id FROM subjects WHERE id = ? AND course_id = ? LIMIT 1`,
    [subjectId, courseId]
  );
  if (!rows.length) throw subjectNotFound();
}

async function fetchQuestionWithOptions(questionId, connection) {
  const { sql, params } = activeQuestionByIdLookup(questionId);
  const [questionRows] = await connection.query(sql, params);
  const question = questionRows[0];
  if (!question) {
    throw new QuestionNotFoundError({ questionId });
  }

  const [optionRows] = await connection.query(
    `SELECT id, question_id, option_key, option_text, option_html, image_url, is_correct, sort_order, created_at, updated_at
     FROM question_options
     WHERE question_id = ?
     ORDER BY sort_order ASC, id ASC`,
    [questionId]
  );

  return toQuestionBankDto(question, optionRows);
}

async function insertQuestionOptions(connection, questionId, options) {
  for (const option of options) {
    await connection.query(
      `INSERT INTO question_options (question_id, option_key, option_text, option_html, image_url, is_correct, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        questionId,
        option.option_key,
        option.option_text.trim(),
        (option.option_html ?? option.option_text).trim(),
        option.image_url ?? null,
        option.is_correct ? 1 : 0,
        option.sort_order,
      ]
    );
  }
}

/**
 * Post-insert integrity check — exactly one correct row must exist.
 * Database triggers provide a second line of defense.
 */
async function assertExactlyOneCorrectInDatabase(connection, questionId) {
  const [rows] = await connection.query(
    `SELECT COUNT(*) AS correct_count
     FROM question_options
     WHERE question_id = ? AND is_correct = 1`,
    [questionId]
  );
  const count = Number(rows[0]?.correct_count ?? 0);
  if (count !== 1) {
    throw new ApiError(500, 'Question options integrity check failed after insert', {
      code: 'CORRECT_OPTION_INTEGRITY_FAILED',
      correct_count: count,
      question_id: questionId,
    });
  }
}

/**
 * Persist a question that already passed validateQuestionWritePayload.
 *
 * @param {{
 *   course_id: number,
 *   subject_id?: number|null,
 *   topic?: string|null,
 *   difficulty?: string|null,
 *   question_type?: string,
 *   question_text: string,
 *   question_image_url?: string|null,
 *   marks: number,
 *   explanation?: string|null,
 *   options: unknown[],
 * }} preparedPayload
 * @param {number} createdBy
 */
export async function createQuestionFromPreparedPayload(preparedPayload, createdBy) {
  const secured = preparedPayload;
  const normalizedOptions = Array.isArray(secured.options) ? secured.options : [];

  if (!Number.isFinite(createdBy) || createdBy <= 0) {
    throw new ApiError(401, 'Authenticated admin required', { code: 'UNAUTHORIZED' });
  }

  await assertCourseExists(secured.course_id);

  const connection = await mysqlPool.getConnection();
  try {
    console.info(`${LOG_PREFIX} transaction started`, {
      course_id: secured.course_id,
      option_count: normalizedOptions.length,
      created_by: createdBy,
    });

    await connection.beginTransaction();

    if (secured.subject_id != null) {
      await assertSubjectBelongsToCourse(secured.subject_id, secured.course_id, connection);
    }

    const [insertResult] = await connection.query(
      `INSERT INTO question_bank
         (course_id, subject_id, topic, difficulty, question_type, question_text, question_html, question_image_url, explanation, explanation_html, marks, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        secured.course_id,
        secured.subject_id ?? null,
        secured.topic ?? null,
        secured.difficulty ?? null,
        PHASE_1_QUESTION_TYPE,
        secured.question_text.trim(),
        (secured.question_html ?? secured.question_text).trim(),
        secured.question_image_url ?? null,
        secured.explanation ?? null,
        secured.explanation_html ?? secured.explanation ?? null,
        secured.marks,
        createdBy,
      ]
    );

    const questionId = Number(insertResult.insertId);
    if (!Number.isFinite(questionId) || questionId <= 0) {
      throw new ApiError(500, 'Question insert did not return a valid id', {
        code: 'QUESTION_INSERT_FAILED',
      });
    }

    await insertQuestionOptions(connection, questionId, normalizedOptions);
    await assertExactlyOneCorrectInDatabase(connection, questionId);
    await assertPersistedQuestionIntegrity(connection, questionId);

    const created = await fetchQuestionWithOptions(questionId, connection);
    await connection.commit();

    console.info(`${LOG_PREFIX} commit completed`, { question_id: questionId });
    return created;
  } catch (error) {
    logTransactionRollback({
      operation: 'create',
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
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * @param {{
 *   course_id: number,
 *   subject_id?: number|null,
 *   topic?: string|null,
 *   difficulty?: string|null,
 *   question_type?: string,
 *   question_text: string,
 *   question_image_url?: string|null,
 *   marks: number,
 *   explanation?: string|null,
 *   options: unknown[],
 * }} payload
 * @param {number} createdBy
 */
export async function createQuestionService(payload, createdBy) {
  const { payload: prepared } = assertQuestionWritePayloadValid(payload);
  return createQuestionFromPreparedPayload(prepared, createdBy);
}
