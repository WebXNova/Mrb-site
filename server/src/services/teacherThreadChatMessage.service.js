import path from 'path';
import { mysqlPool } from '../config/mysql.js';
import { sanitizePlainText } from '../utils/plainTextSanitizer.js';
import { ApiError } from '../utils/apiError.js';
import { assertTeacherIsOperational } from './teacher.service.js';
import { mapRowToTeacherQuestionDetail } from './teacherQuestionDetail.service.js';
import {
  resolveStudentUserIdFromThreadId,
  buildTeacherQuestionThreadId,
} from './teacherQuestionThreadRef.js';
import {
  TEACHER_INITIATED_PLACEHOLDER_BODY,
  validateTeacherAnswerWords,
} from '../utils/qaWordValidation.js';
import { deriveSubjectStorageSlug } from '../utils/subjectStorageSlug.js';

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

/**
 * Teacher-initiated chat message in an existing student thread (WhatsApp-style).
 */
export async function sendTeacherThreadChatMessage(teacherId, threadId, payload) {
  const tid = Number(teacherId);
  if (!tid) {
    throw new ApiError(401, 'Authentication required', { code: 'AUTH_REQUIRED' });
  }

  await assertTeacherIsOperational(tid);

  const studentUserId = await resolveStudentUserIdFromThreadId(mysqlPool, tid, threadId);
  if (!studentUserId) {
    throw new ApiError(404, 'Conversation not found', { code: 'THREAD_NOT_FOUND' });
  }

  const sanitizedBody = sanitizeAnswerBody(payload.body);
  const imageUrl = normalizeTeacherAnswerUrl(payload.imageUrl, tid, { requireRecordingPrefix: false });
  const audioUrl = normalizeTeacherAnswerUrl(payload.audioUrl, tid, { requireRecordingPrefix: true });
  const hasMedia = Boolean(imageUrl || audioUrl);
  const wordCheck = validateTeacherAnswerWords(sanitizedBody, hasMedia);
  if (!wordCheck.ok) {
    throw new ApiError(422, wordCheck.message, { code: wordCheck.code });
  }
  if (sanitizedBody.length > 5000) {
    throw new ApiError(422, 'Message is too long', { code: 'ANSWER_TOO_LONG' });
  }

  const connection = await mysqlPool.getConnection();
  try {
    await connection.beginTransaction();

    const [contextRows] = await connection.query(
      `SELECT sq.user_id, sq.course_id, sq.subject_id, sq.subject, s.title AS subject_title
       FROM student_questions sq
       LEFT JOIN subjects s ON s.id = sq.subject_id
       WHERE sq.user_id = ? AND sq.assigned_teacher_id = ?
       ORDER BY sq.updated_at DESC, sq.id DESC
       LIMIT 1
       FOR UPDATE`,
      [studentUserId, tid]
    );

    if (!contextRows[0]) {
      await connection.rollback();
      return { kind: 'access_denied' };
    }

    const ctx = contextRows[0];
    const courseId = ctx.course_id != null ? Number(ctx.course_id) : null;
    const subjectRowId = ctx.subject_id != null ? Number(ctx.subject_id) : null;
    const legacySlug =
      String(ctx.subject || '').trim() ||
      deriveSubjectStorageSlug(ctx.subject_title, subjectRowId);
    const teacherThreadRef = buildTeacherQuestionThreadId(tid, studentUserId);
    const placeholderBody = TEACHER_INITIATED_PLACEHOLDER_BODY;
    const title = 'Teacher message';

    let insertResult;
    try {
      [insertResult] = await connection.query(
        `INSERT INTO student_questions (
           user_id, course_id, subject_id, assigned_teacher_id, teacher_thread_ref,
           subject, title, body, answer, answer_attachment_url, answer_audio_url,
           status, answered_by, answered_at, seen_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'answered', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [
          studentUserId,
          courseId,
          subjectRowId,
          tid,
          teacherThreadRef,
          legacySlug,
          title,
          placeholderBody,
          sanitizedBody,
          imageUrl,
          audioUrl,
          tid,
        ]
      );
    } catch (error) {
      if (isMissingColumn(error, 'teacher_thread_ref') || isMissingColumn(error, 'answer_attachment_url')) {
        [insertResult] = await connection.query(
          `INSERT INTO student_questions (
             user_id, course_id, subject_id, assigned_teacher_id,
             subject, title, body, answer, status, answered_by, answered_at, seen_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'answered', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          [
            studentUserId,
            courseId,
            subjectRowId,
            tid,
            legacySlug,
            title,
            placeholderBody,
            sanitizedBody,
            tid,
          ]
        );
      } else {
        throw error;
      }
    }

    const questionId = Number(insertResult.insertId);
    const [rows] = await connection.query(`${DETAIL_SELECT} WHERE sq.id = ? LIMIT 1`, [questionId]);
    await connection.commit();

    const detail = mapRowToTeacherQuestionDetail(rows[0]);
    if (!detail) {
      throw new ApiError(500, 'Message was not persisted', { code: 'CREATE_PERSISTENCE_FAILED' });
    }

    return { kind: 'ok', detail };
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      /* ignore */
    }
    if (isMissingQuestionsTable(error)) {
      return { kind: 'access_denied' };
    }
    throw error;
  } finally {
    connection.release();
  }
}
