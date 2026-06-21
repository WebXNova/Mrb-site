import { mysqlPool } from '../config/mysql.js';
import { ApiError } from '../utils/apiError.js';
import { assertTeacherIsOperational } from './teacher.service.js';
import {
  mapDbStatusToStudentStatus,
  parseStudentQuestionId,
} from './studentQuestionStudentView.service.js';
import { MARK_TEACHER_QUESTION_UNSEEN_SEEN_SQL } from './teacherQuestionSeen.service.js';

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
    sq.teacher_pinned_at,
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

function resolveSubjectLabel(row) {
  const title = String(row?.subject_title || '').trim();
  if (title) return title;
  const slug = String(row?.subject || '').trim();
  if (!slug) return 'Subject';
  return slug.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function normalizeTeacherId(teacherId) {
  const tid = Number(teacherId);
  if (!Number.isInteger(tid) || tid <= 0) return null;
  return tid;
}

function isMissingQuestionsTable(error) {
  return error?.code === 'ER_NO_SUCH_TABLE' && String(error?.sqlMessage || '').includes('student_questions');
}

/**
 * Teacher-safe detail DTO — never exposes routing ids or student email.
 * @param {Record<string, unknown>} row
 */
export function mapRowToTeacherQuestionDetail(row) {
  if (!row) return null;
  const status = mapDbStatusToStudentStatus(row);
  const answer = String(row.answer || '').trim();

  return {
    id: Number(row.id),
    status,
    title: row.title,
    body: row.body,
    attachmentUrl: row.attachment_url ?? null,
    audioUrl: row.audio_url ?? null,
    answer: answer || null,
    answerImageUrl: row.answer_attachment_url ?? null,
    answerAudioUrl: row.answer_audio_url ?? null,
    studentName: row.student_name ?? null,
    courseName: row.course_name ?? null,
    subjectName: resolveSubjectLabel(row),
    subjectSlug: String(row.subject || '').toLowerCase() || null,
    createdAt: row.created_at,
    seenAt: row.seen_at ?? null,
    answeredAt: row.answered_at ?? null,
    updatedAt: row.updated_at,
    canAnswer: status === 'sent' || status === 'seen',
    isPinned: Boolean(row.teacher_pinned_at),
    hasAttachment: Boolean(row.attachment_url || row.audio_url),
    hasReply: status === 'answered' && Boolean(answer),
    hasAnswerMedia: Boolean(row.answer_attachment_url || row.answer_audio_url),
  };
}

/**
 * Open assigned question, mark seen once (sent → seen), return teacher-safe detail.
 * @param {number} teacherId — session only
 * @param {string|number} questionId — URL param
 * @returns {Promise<
 *   | { kind: 'invalid_id' }
 *   | { kind: 'access_denied' }
 *   | { kind: 'ok', detail: object, statusUpdated: boolean }
 * >}
 */
export async function openTeacherQuestionDetail(teacherId, questionId) {
  const tid = normalizeTeacherId(teacherId);
  const id = parseStudentQuestionId(questionId);
  if (!tid || !id) {
    return { kind: 'invalid_id' };
  }

  await assertTeacherIsOperational(tid);

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

    let row = rows[0];
    let statusUpdated = false;

    if (String(row.status || '').toLowerCase() === 'pending' && !row.seen_at) {
      const [updateResult] = await connection.query(MARK_TEACHER_QUESTION_UNSEEN_SEEN_SQL, [id, tid]);
      statusUpdated = Number(updateResult.affectedRows ?? 0) > 0;

      if (statusUpdated) {
        const [refreshed] = await connection.query(
          `${DETAIL_SELECT}
           WHERE sq.id = ? AND sq.assigned_teacher_id = ?
           LIMIT 1`,
          [id, tid]
        );
        if (refreshed[0]) row = refreshed[0];
      }
    }

    await connection.commit();

    const detail = mapRowToTeacherQuestionDetail(row);
    if (!detail) {
      throw new ApiError(500, 'Question could not be loaded', { code: 'DETAIL_MAP_FAILED' });
    }

    return { kind: 'ok', detail, statusUpdated };
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      // ignore rollback errors
    }
    if (isMissingQuestionsTable(error)) {
      throw new ApiError(503, 'Q&A storage is not initialized', { code: 'QA_STORAGE_UNAVAILABLE' });
    }
    throw error;
  } finally {
    connection.release();
  }
}
