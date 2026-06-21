import { mysqlPool } from '../config/mysql.js';

/** Student-facing status values (canonical API contract). */
export const STUDENT_QUESTION_PUBLIC_STATUSES = Object.freeze(['sent', 'seen', 'answered']);

const LIST_SELECT = `
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
    s.title AS subject_title
  FROM student_questions sq
  LEFT JOIN subjects s ON s.id = sq.subject_id
`;

/**
 * @param {string|number} raw
 * @returns {number|null}
 */
export function parseStudentQuestionId(raw) {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) return null;
  return id;
}

/**
 * Map DB row to student-facing lifecycle status.
 * @param {{ status?: string, answer?: string|null, seen_at?: Date|string|null }} row
 * @returns {'sent'|'seen'|'answered'}
 */
export function mapDbStatusToStudentStatus(row) {
  if (!row) return 'sent';
  const raw = String(row.status || '').toLowerCase();
  if (raw === 'answered' || (row.answer && String(row.answer).trim())) {
    return 'answered';
  }
  if (raw === 'seen' || row.seen_at) {
    return 'seen';
  }
  return 'sent';
}

function resolveSubjectLabel(row) {
  const title = String(row.subject_title || '').trim();
  if (title) return title;
  const slug = String(row.subject || '').trim();
  if (!slug) return 'Subject';
  return slug.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function hasAttachment(row) {
  return Boolean(row.attachment_url || row.audio_url);
}

function hasAnswerMedia(row) {
  return Boolean(row.answer_attachment_url || row.answer_audio_url);
}

/**
 * @param {Record<string, unknown>} row
 */
export function mapRowToStudentQuestionListItem(row) {
  if (!row) return null;
  const status = mapDbStatusToStudentStatus(row);
  const hasReply = status === 'answered' && Boolean(String(row.answer || '').trim());

  return {
    id: Number(row.id),
    subjectLabel: resolveSubjectLabel(row),
    subjectSlug: String(row.subject || '').toLowerCase() || null,
    title: row.title,
    bodyPreview: row.body,
    status,
    hasReply,
    hasAttachment: hasAttachment(row),
    hasAnswerMedia: hasReply && hasAnswerMedia(row),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    answeredAt: row.answered_at ?? null,
  };
}

/**
 * Privacy-safe detail — includes answer when available; never exposes routing fields.
 * @param {Record<string, unknown>} row
 */
export function mapRowToStudentQuestionDetail(row) {
  if (!row) return null;
  const status = mapDbStatusToStudentStatus(row);
  const answer = String(row.answer || '').trim();

  return {
    id: Number(row.id),
    subjectLabel: resolveSubjectLabel(row),
    subjectSlug: String(row.subject || '').toLowerCase() || null,
    title: row.title,
    body: row.body,
    attachmentUrl: row.attachment_url ?? null,
    audioUrl: row.audio_url ?? null,
    answer: answer || null,
    answerImageUrl: row.answer_attachment_url ?? null,
    answerAudioUrl: row.answer_audio_url ?? null,
    status,
    hasReply: status === 'answered' && Boolean(answer),
    hasAttachment: hasAttachment(row),
    hasAnswerMedia: status === 'answered' && hasAnswerMedia(row),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    answeredAt: row.answered_at ?? null,
    seenAt: row.seen_at ?? null,
  };
}

function isMissingQuestionsTable(error) {
  return error?.code === 'ER_NO_SUCH_TABLE' && String(error?.sqlMessage || '').includes('student_questions');
}

function normalizeStudentUserId(userId) {
  const uid = Number(userId);
  if (!Number.isInteger(uid) || uid <= 0) return null;
  return uid;
}

/**
 * List questions owned by the authenticated student only.
 * @param {number} userId — from session, never from client params
 */
export async function listStudentQuestionsForStudent(userId) {
  const uid = normalizeStudentUserId(userId);
  if (!uid) return [];

  try {
    const [rows] = await mysqlPool.query(
      `${LIST_SELECT}
       WHERE sq.user_id = ?
       ORDER BY sq.updated_at DESC, sq.id DESC`,
      [uid]
    );
    return rows.map(mapRowToStudentQuestionListItem).filter(Boolean);
  } catch (error) {
    if (isMissingQuestionsTable(error)) return [];
    throw error;
  }
}

/**
 * Fetch one question with ownership enforced in SQL (IDOR-safe).
 * @param {number} userId — from session
 * @param {string|number} questionId — from URL; validated server-side
 */
export async function getStudentQuestionDetailForStudent(userId, questionId) {
  const uid = normalizeStudentUserId(userId);
  const id = parseStudentQuestionId(questionId);
  if (!uid || !id) return null;

  try {
    const [rows] = await mysqlPool.query(
      `${LIST_SELECT}
       WHERE sq.id = ? AND sq.user_id = ?
       LIMIT 1`,
      [id, uid]
    );
    return mapRowToStudentQuestionDetail(rows[0]);
  } catch (error) {
    if (isMissingQuestionsTable(error)) return null;
    throw error;
  }
}
