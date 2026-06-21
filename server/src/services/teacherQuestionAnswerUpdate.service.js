import path from 'path';
import { mysqlPool } from '../config/mysql.js';
import { sanitizePlainText } from '../utils/plainTextSanitizer.js';
import { ApiError } from '../utils/apiError.js';
import { assertTeacherIsOperational } from './teacher.service.js';
import { parseStudentQuestionId } from './studentQuestionStudentView.service.js';
import { mapRowToTeacherQuestionDetail } from './teacherQuestionDetail.service.js';
import { updateTeacherAnswerInTransaction } from './teacherAnswer.service.js';
import { validateTeacherAnswerWords } from '../utils/qaWordValidation.js';

const TEACHER_QA_PREFIX = '/api/uploads/teacher-qa/';

function sanitizeAnswerBody(raw) {
  return sanitizePlainText(String(raw ?? '').replace(/\u0000/g, ''));
}

function normalizeTeacherAnswerUrl(raw, teacherId, { requireRecordingPrefix = false } = {}) {
  if (raw === undefined || raw === null || String(raw).trim() === '') return null;
  const s = String(raw).trim();
  if (!s.startsWith(TEACHER_QA_PREFIX)) {
    throw new ApiError(400, 'Invalid attachment URL', { code: 'INVALID_ATTACHMENT_URL' });
  }
  if (s.includes('..')) {
    throw new ApiError(400, 'Invalid attachment URL', { code: 'INVALID_ATTACHMENT_URL' });
  }
  const base = path.posix.basename(s);
  if (!/^[a-zA-Z0-9._-]+$/.test(base)) {
    throw new ApiError(400, 'Invalid attachment URL', { code: 'INVALID_ATTACHMENT_URL' });
  }
  const expectedPrefix = `${Number(teacherId)}-`;
  if (!base.startsWith(expectedPrefix)) {
    throw new ApiError(403, 'Attachment does not belong to your account', { code: 'ATTACHMENT_OWNERSHIP_DENIED' });
  }
  const isRecording = base.includes('-rec-');
  if (requireRecordingPrefix && !isRecording) {
    throw new ApiError(403, 'Invalid audio recording URL', { code: 'AUDIO_URL_FORBIDDEN' });
  }
  if (!requireRecordingPrefix && isRecording) {
    throw new ApiError(400, 'Invalid image attachment URL', { code: 'INVALID_ATTACHMENT_URL' });
  }
  return s;
}

function isMissingColumn(error, column) {
  return error?.code === 'ER_BAD_FIELD_ERROR' && String(error?.sqlMessage || '').includes(column);
}

function isMissingQuestionsTable(error) {
  return error?.code === 'ER_NO_SUCH_TABLE' && String(error?.sqlMessage || '').includes('student_questions');
}

const DETAIL_SELECT = `
  SELECT
    sq.id,
    sq.subject,
    sq.subject_id,
    sq.title,
    sq.body,
    sq.attachment_url,
    sq.audio_url,
    sq.answer,
    sq.answer_attachment_url,
    sq.answer_audio_url,
    sq.status,
    sq.seen_at,
    sq.created_at,
    sq.updated_at,
    sq.answered_at,
    u.full_name AS student_name,
    c.title AS course_name,
    s.title AS subject_title
  FROM student_questions sq
  INNER JOIN users u ON u.id = sq.user_id
  LEFT JOIN courses c ON c.id = sq.course_id
  LEFT JOIN subjects s ON s.id = sq.subject_id
`;

/**
 * Update an existing teacher answer. Only the answering teacher may edit.
 *
 * @param {number} teacherId
 * @param {string|number} questionId
 * @param {{ body: string, imageUrl?: string|null, audioUrl?: string|null }} payload
 */
export async function updateTeacherQuestionAnswer(teacherId, questionId, payload) {
  const tid = Number(teacherId);
  const id = parseStudentQuestionId(questionId);
  if (!tid || !id) {
    throw new ApiError(404, 'Question not found', { code: 'QUESTION_NOT_FOUND' });
  }

  await assertTeacherIsOperational(tid);

  const sanitizedBody = sanitizeAnswerBody(payload.body);
  const imageUrl = normalizeTeacherAnswerUrl(payload.imageUrl, tid, { requireRecordingPrefix: false });
  const audioUrl = normalizeTeacherAnswerUrl(payload.audioUrl, tid, { requireRecordingPrefix: true });
  const hasMedia = Boolean(imageUrl || audioUrl);
  const wordCheck = validateTeacherAnswerWords(sanitizedBody, hasMedia);
  if (!wordCheck.ok) {
    throw new ApiError(422, wordCheck.message, { code: wordCheck.code });
  }
  if (sanitizedBody.length > 5000) {
    throw new ApiError(422, 'Answer is too long', { code: 'ANSWER_TOO_LONG' });
  }

  const connection = await mysqlPool.getConnection();
  try {
    await connection.beginTransaction();

    const [rows] = await connection.query(
      `${DETAIL_SELECT}
       WHERE sq.id = ? AND sq.assigned_teacher_id = ?
       LIMIT 1
       FOR UPDATE`,
      [id, tid]
    );

    if (!rows[0]) {
      await connection.rollback();
      return { kind: 'access_denied' };
    }

    const row = rows[0];
    if (String(row.status || '').toLowerCase() !== 'answered' && !String(row.answer || '').trim()) {
      await connection.rollback();
      return { kind: 'not_answered' };
    }

    if (Number(row.answered_by) && Number(row.answered_by) !== tid) {
      await connection.rollback();
      return { kind: 'access_denied' };
    }

    let updateResult;
    try {
      [updateResult] = await connection.query(
        `UPDATE student_questions
         SET answer = ?,
             answer_attachment_url = ?,
             answer_audio_url = ?,
             status = 'answered',
             answered_by = ?,
             answered_at = COALESCE(answered_at, CURRENT_TIMESTAMP),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?
           AND assigned_teacher_id = ?`,
        [sanitizedBody, imageUrl, audioUrl, tid, id, tid]
      );
    } catch (error) {
      if (isMissingColumn(error, 'answer_attachment_url') || isMissingColumn(error, 'answer_audio_url')) {
        [updateResult] = await connection.query(
          `UPDATE student_questions
           SET answer = ?,
               status = 'answered',
               answered_by = ?,
               answered_at = COALESCE(answered_at, CURRENT_TIMESTAMP),
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?
             AND assigned_teacher_id = ?`,
          [sanitizedBody, tid, id, tid]
        );
      } else {
        throw error;
      }
    }

    if (!updateResult?.affectedRows) {
      await connection.rollback();
      return { kind: 'not_answered' };
    }

    await updateTeacherAnswerInTransaction(connection, {
      questionId: id,
      teacherId: tid,
      answer: sanitizedBody,
      imageUrl,
      audioUrl,
    });

    const [updated] = await connection.query(
      `${DETAIL_SELECT}
       WHERE sq.id = ? AND sq.assigned_teacher_id = ?
       LIMIT 1`,
      [id, tid]
    );

    await connection.commit();

    const detail = mapRowToTeacherQuestionDetail(updated[0]);
    if (!detail) {
      throw new ApiError(500, 'Answer was updated but could not be loaded', { code: 'ANSWER_LOAD_FAILED' });
    }

    return { kind: 'ok', detail };
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      // ignore
    }
    if (error instanceof ApiError) throw error;
    if (isMissingQuestionsTable(error)) {
      throw new ApiError(503, 'Q&A storage is not initialized', { code: 'QA_STORAGE_UNAVAILABLE' });
    }
    throw error;
  } finally {
    connection.release();
  }
}
