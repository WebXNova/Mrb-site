import { mysqlPool } from '../config/mysql.js';
import { ApiError } from '../utils/apiError.js';

function mapAnswerRow(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    questionId: Number(row.question_id),
    teacherId: Number(row.teacher_id),
    answer: row.answer,
    answerAttachmentUrl: row.answer_attachment_url ?? null,
    answerAudioUrl: row.answer_audio_url ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function isMissingTable(error, table) {
  return error?.code === 'ER_NO_SUCH_TABLE' && String(error?.sqlMessage || '').includes(table);
}

/**
 * Upsert teacher answer row after inline student_questions answer is saved.
 * Keeps student_questions.answer as source of truth for student views (no breaking change).
 *
 * @param {import('mysql2/promise').PoolConnection} connection
 * @param {{
 *   questionId: number,
 *   teacherId: number,
 *   answer: string,
 *   imageUrl?: string|null,
 *   audioUrl?: string|null,
 * }} payload
 */
export async function upsertTeacherAnswerInTransaction(connection, payload) {
  const questionId = Number(payload.questionId);
  const teacherId = Number(payload.teacherId);
  if (!questionId || !teacherId) return null;

  try {
    await connection.query(
      `INSERT INTO teacher_answers (question_id, teacher_id, answer, answer_attachment_url, answer_audio_url)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         teacher_id = VALUES(teacher_id),
         answer = VALUES(answer),
         answer_attachment_url = VALUES(answer_attachment_url),
         answer_audio_url = VALUES(answer_audio_url),
         updated_at = CURRENT_TIMESTAMP`,
      [
        questionId,
        teacherId,
        payload.answer,
        payload.imageUrl ?? null,
        payload.audioUrl ?? null,
      ]
    );

    const [rows] = await connection.query(
      `SELECT * FROM teacher_answers WHERE question_id = ? LIMIT 1`,
      [questionId]
    );
    return mapAnswerRow(rows[0]);
  } catch (error) {
    if (isMissingTable(error, 'teacher_answers')) {
      return null;
    }
    throw error;
  }
}

/**
 * @param {number} questionId
 */
export async function getTeacherAnswerByQuestionId(questionId) {
  const id = Number(questionId);
  if (!id) return null;
  try {
    const [rows] = await mysqlPool.query(
      `SELECT * FROM teacher_answers WHERE question_id = ? LIMIT 1`,
      [id]
    );
    return mapAnswerRow(rows[0]);
  } catch (error) {
    if (isMissingTable(error, 'teacher_answers')) return null;
    throw error;
  }
}

/**
 * Update normalized answer row in transaction (teacher must own answer).
 *
 * @param {import('mysql2/promise').PoolConnection} connection
 * @param {{
 *   questionId: number,
 *   teacherId: number,
 *   answer: string,
 *   imageUrl?: string|null,
 *   audioUrl?: string|null,
 * }} payload
 */
export async function updateTeacherAnswerInTransaction(connection, payload) {
  const questionId = Number(payload.questionId);
  const teacherId = Number(payload.teacherId);
  if (!questionId || !teacherId) {
    throw new ApiError(404, 'Answer not found', { code: 'ANSWER_NOT_FOUND' });
  }

  try {
    const [result] = await connection.query(
      `UPDATE teacher_answers
       SET answer = ?,
           answer_attachment_url = ?,
           answer_audio_url = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE question_id = ?
         AND teacher_id = ?`,
      [
        payload.answer,
        payload.imageUrl ?? null,
        payload.audioUrl ?? null,
        questionId,
        teacherId,
      ]
    );

    if (!result?.affectedRows) {
      throw new ApiError(404, 'Answer not found or not owned by teacher', { code: 'ANSWER_NOT_FOUND' });
    }

    const [rows] = await connection.query(
      `SELECT * FROM teacher_answers WHERE question_id = ? LIMIT 1`,
      [questionId]
    );
    return mapAnswerRow(rows[0]);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (isMissingTable(error, 'teacher_answers')) {
      throw new ApiError(503, 'Answer storage is not initialized', { code: 'ANSWER_STORAGE_UNAVAILABLE' });
    }
    throw error;
  }
}

export { mapAnswerRow };
