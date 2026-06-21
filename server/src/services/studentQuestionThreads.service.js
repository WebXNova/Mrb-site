import { mysqlPool } from '../config/mysql.js';
import { ApiError } from '../utils/apiError.js';
import { getStudentQuestionFormContext } from './studentQuestionFormContext.service.js';
import {
  mapDbStatusToStudentStatus,
  mapRowToStudentQuestionDetail,
  parseStudentQuestionId,
} from './studentQuestionStudentView.service.js';
import { isTeacherInitiatedBody } from '../utils/qaWordValidation.js';

const THREAD_MESSAGE_SELECT = `
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
    s.title AS subject_title,
    c.title AS course_title
  FROM student_questions sq
  LEFT JOIN subjects s ON s.id = sq.subject_id
  LEFT JOIN courses c ON c.id = sq.course_id
`;

function bodyPreview(body, max = 140) {
  const text = String(body || '').replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function resolveSubjectLabel(row) {
  const title = String(row?.subject_title || row?.title || '').trim();
  if (title) return title;
  const slug = String(row?.subject || '').trim();
  if (!slug) return 'Subject';
  return slug.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function isMissingQuestionsTable(error) {
  return error?.code === 'ER_NO_SUCH_TABLE' && String(error?.sqlMessage || '').includes('student_questions');
}

function parseSubjectThreadId(raw) {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) return null;
  return id;
}

function buildStatusFilter(status) {
  switch (status) {
    case 'sent':
      return (stats) => Number(stats.pending_count ?? 0) > 0;
    case 'seen':
      return (stats) => Number(stats.seen_count ?? 0) > 0;
    case 'answered':
      return (stats) => Number(stats.answered_count ?? 0) > 0;
    default:
      return () => true;
  }
}

function mapThreadMessage(row) {
  const detail = mapRowToStudentQuestionDetail(row);
  if (!detail) return null;
  return {
    id: detail.id,
    status: detail.status,
    body: detail.body,
    attachmentUrl: detail.attachmentUrl,
    audioUrl: detail.audioUrl,
    answer: detail.answer,
    answerImageUrl: detail.answerImageUrl,
    answerAudioUrl: detail.answerAudioUrl,
    subjectLabel: detail.subjectLabel,
    subjectSlug: detail.subjectSlug,
    createdAt: detail.createdAt,
    seenAt: detail.seenAt,
    answeredAt: detail.answeredAt,
    updatedAt: detail.updatedAt,
    hasReply: detail.hasReply,
    isTeacherInitiated: isTeacherInitiatedBody(detail.body),
  };
}

async function loadSubjectStats(userId) {
  try {
    const [rows] = await mysqlPool.query(
      `SELECT
         sq.subject_id,
         COUNT(*) AS message_count,
         SUM(CASE WHEN sq.status = 'pending' AND sq.seen_at IS NULL THEN 1 ELSE 0 END) AS sent_count,
         SUM(CASE WHEN sq.status = 'pending' AND sq.seen_at IS NOT NULL THEN 1 ELSE 0 END) AS seen_count,
         SUM(CASE WHEN sq.status = 'answered' THEN 1 ELSE 0 END) AS answered_count,
         SUM(CASE WHEN sq.status != 'answered' OR sq.answer IS NULL OR TRIM(sq.answer) = '' THEN 1 ELSE 0 END) AS pending_count,
         MAX(sq.updated_at) AS last_activity_at,
         SUBSTRING_INDEX(
           GROUP_CONCAT(sq.body ORDER BY sq.updated_at DESC, sq.id DESC SEPARATOR '\x1e'),
           '\x1e',
           1
         ) AS latest_body,
         SUBSTRING_INDEX(
           GROUP_CONCAT(sq.id ORDER BY sq.updated_at DESC, sq.id DESC SEPARATOR '\x1e'),
           '\x1e',
           1
         ) AS latest_question_id
       FROM student_questions sq
       WHERE sq.user_id = ?
       GROUP BY sq.subject_id`,
      [userId]
    );
    return new Map(rows.map((row) => [Number(row.subject_id), row]));
  } catch (error) {
    if (isMissingQuestionsTable(error)) return new Map();
    throw error;
  }
}

function mapThreadRow(subject, stats, courseTitle) {
  const subjectId = Number(subject.id);
  const messageCount = Number(stats?.message_count ?? 0);
  const pendingCount = Number(stats?.pending_count ?? 0);
  const hasReply = Number(stats?.answered_count ?? 0) > 0;

  return {
    threadId: String(subjectId),
    subjectId,
    subjectLabel: String(subject.title || '').trim() || 'Subject',
    subjectSlug: null,
    courseName: courseTitle,
    bodyPreview: stats?.latest_body ? bodyPreview(stats.latest_body) : '',
    messageCount,
    pendingCount,
    hasUnreadReply: false,
    isWaiting: pendingCount > 0,
    hasReply,
    lastActivityAt: stats?.last_activity_at ?? null,
    latestQuestionId: stats?.latest_question_id ? Number(stats.latest_question_id) : null,
  };
}

/**
 * Subject-thread inbox for student — one chat per entitled subject.
 */
export async function listStudentQuestionThreads(userId, query = {}) {
  const uid = Number(userId);
  if (!uid) {
    throw new ApiError(401, 'Authentication required', { code: 'AUTH_REQUIRED' });
  }

  const context = await getStudentQuestionFormContext(uid);
  const subjects = Array.isArray(context.subjects) ? context.subjects : [];
  const courseTitle = context.course?.title ?? 'Course';
  const statsBySubject = await loadSubjectStats(uid);
  const statusFilter = buildStatusFilter(query.status || 'all');
  const search = String(query.search || '').trim().toLowerCase();

  let items = subjects
    .map((subject) => mapThreadRow(subject, statsBySubject.get(Number(subject.id)), courseTitle))
    .filter((item) => statusFilter(statsBySubject.get(item.subjectId) || {}));

  if (search) {
    items = items.filter(
      (item) =>
        item.subjectLabel.toLowerCase().includes(search) ||
        item.bodyPreview.toLowerCase().includes(search) ||
        item.courseName.toLowerCase().includes(search)
    );
  }

  items.sort((a, b) => {
    const aTime = a.lastActivityAt ? new Date(a.lastActivityAt).getTime() : 0;
    const bTime = b.lastActivityAt ? new Date(b.lastActivityAt).getTime() : 0;
    if (bTime !== aTime) return bTime - aTime;
    return a.subjectLabel.localeCompare(b.subjectLabel);
  });

  const allStats = [...statsBySubject.values()];
  const sent = allStats.reduce((sum, row) => sum + Number(row.sent_count ?? 0), 0);
  const seen = allStats.reduce((sum, row) => sum + Number(row.seen_count ?? 0), 0);
  const answered = allStats.reduce((sum, row) => sum + Number(row.answered_count ?? 0), 0);

  return {
    items,
    course: context.course,
    summary: {
      all: sent + seen + answered,
      sent,
      seen,
      answered,
      subjects: subjects.length,
    },
  };
}

async function assertSubjectEntitled(userId, subjectId) {
  const context = await getStudentQuestionFormContext(userId);
  const allowed = (context.subjects || []).some((subject) => Number(subject.id) === subjectId);
  if (!allowed) return null;
  return context;
}

/**
 * Open a subject thread with chronological messages.
 */
export async function openStudentQuestionThread(userId, threadId) {
  const uid = Number(userId);
  const subjectId = parseSubjectThreadId(threadId);
  if (!uid || !subjectId) {
    return { kind: 'invalid_id' };
  }

  const context = await assertSubjectEntitled(uid, subjectId);
  if (!context) {
    return { kind: 'access_denied' };
  }

  const subject = (context.subjects || []).find((row) => Number(row.id) === subjectId);
  const subjectLabel = String(subject?.title || '').trim() || 'Subject';

  try {
    const [rows] = await mysqlPool.query(
      `${THREAD_MESSAGE_SELECT}
       WHERE sq.user_id = ? AND sq.subject_id = ?
       ORDER BY sq.created_at ASC, sq.id ASC`,
      [uid, subjectId]
    );

    const messages = rows.map(mapThreadMessage).filter(Boolean);

    return {
      kind: 'ok',
      thread: {
        threadId: String(subjectId),
        subjectId,
        subjectLabel,
        subjectSlug: messages[0]?.subjectSlug ?? null,
        courseName: context.course?.title ?? 'Course',
        messageCount: messages.length,
        lastActivityAt: messages[messages.length - 1]?.updatedAt ?? messages[messages.length - 1]?.createdAt ?? null,
        messages,
      },
    };
  } catch (error) {
    if (isMissingQuestionsTable(error)) {
      return {
        kind: 'ok',
        thread: {
          threadId: String(subjectId),
          subjectId,
          subjectLabel,
          subjectSlug: null,
          courseName: context.course?.title ?? 'Course',
          messageCount: 0,
          lastActivityAt: null,
          messages: [],
        },
      };
    }
    throw error;
  }
}

/**
 * Resolve subject thread id from a question the student owns.
 */
export async function resolveStudentThreadIdFromQuestion(userId, questionId) {
  const uid = Number(userId);
  const id = parseStudentQuestionId(questionId);
  if (!uid || !id) return null;

  try {
    const [rows] = await mysqlPool.query(
      `SELECT subject_id
       FROM student_questions
       WHERE id = ? AND user_id = ?
       LIMIT 1`,
      [id, uid]
    );
    const subjectId = Number(rows[0]?.subject_id);
    if (!subjectId) return null;
    const context = await assertSubjectEntitled(uid, subjectId);
    if (!context) return null;
    return String(subjectId);
  } catch (error) {
    if (isMissingQuestionsTable(error)) return null;
    throw error;
  }
}
