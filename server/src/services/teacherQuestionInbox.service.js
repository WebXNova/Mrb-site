import { mysqlPool } from '../config/mysql.js';
import { ApiError } from '../utils/apiError.js';
import { sanitizeQuestionSearchTerm } from './questionBankQueries.service.js';
import { assertTeacherIsOperational } from './teacher.service.js';
import {
  mapDbStatusToStudentStatus,
  parseStudentQuestionId,
} from './studentQuestionStudentView.service.js';

const INBOX_SELECT = `
  SELECT
    sq.id,
    sq.subject,
    sq.subject_id,
    sq.title,
    sq.body,
    sq.attachment_url,
    sq.audio_url,
    sq.answer,
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

function bodyPreview(body, max = 140) {
  const text = String(body || '').replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function isMissingColumn(error, column) {
  return error?.code === 'ER_BAD_FIELD_ERROR' && String(error?.sqlMessage || '').includes(column);
}

function isMissingQuestionsTable(error) {
  return error?.code === 'ER_NO_SUCH_TABLE' && String(error?.sqlMessage || '').includes('student_questions');
}

function buildStatusFilter(status) {
  switch (status) {
    case 'sent':
      return { clause: `sq.status = 'pending' AND sq.seen_at IS NULL`, params: [] };
    case 'seen':
      return { clause: `sq.status = 'pending' AND sq.seen_at IS NOT NULL`, params: [] };
    case 'answered':
      return { clause: `sq.status = 'answered'`, params: [] };
    default:
      return { clause: '', params: [] };
  }
}

function buildSearchFilter(search) {
  const term = sanitizeQuestionSearchTerm(search);
  if (!term) return { clause: '', params: [] };
  const like = `%${term}%`;
  return {
    clause: `(
      u.full_name LIKE ?
      OR c.title LIKE ?
      OR s.title LIKE ?
      OR sq.subject LIKE ?
      OR sq.title LIKE ?
      OR sq.body LIKE ?
    )`,
    params: [like, like, like, like, like, like],
  };
}

function mapInboxRow(row) {
  if (!row) return null;
  const status = mapDbStatusToStudentStatus(row);
  const hasReply = status === 'answered' && Boolean(String(row.answer || '').trim());
  return {
    id: Number(row.id),
    status,
    isUnread: status === 'sent',
    isPinned: Boolean(row.teacher_pinned_at),
    title: row.title,
    bodyPreview: bodyPreview(row.body),
    studentName: row.student_name ?? 'Student',
    courseName: row.course_name ?? 'Course',
    subjectName: resolveSubjectLabel(row),
    subjectSlug: String(row.subject || '').toLowerCase() || null,
    hasAttachment: Boolean(row.attachment_url || row.audio_url),
    hasReply,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    seenAt: row.seen_at ?? null,
    answeredAt: row.answered_at ?? null,
  };
}

const INBOX_ORDER = `
  ORDER BY
    (sq.teacher_pinned_at IS NOT NULL) DESC,
    sq.teacher_pinned_at DESC,
    CASE
      WHEN sq.status = 'pending' AND sq.seen_at IS NULL THEN 0
      WHEN sq.status = 'pending' AND sq.seen_at IS NOT NULL THEN 1
      ELSE 2
    END,
    sq.updated_at DESC,
    sq.id DESC
`;

const INBOX_ORDER_FALLBACK = `
  ORDER BY
    CASE
      WHEN sq.status = 'pending' AND sq.seen_at IS NULL THEN 0
      WHEN sq.status = 'pending' AND sq.seen_at IS NOT NULL THEN 1
      ELSE 2
    END,
    sq.updated_at DESC,
    sq.id DESC
`;

/**
 * Paginated teacher inbox — assigned_teacher_id enforced in every query.
 */
export async function listTeacherQuestionInbox(teacherId, query = {}) {
  const tid = Number(teacherId);
  if (!tid) {
    throw new ApiError(401, 'Authentication required', { code: 'AUTH_REQUIRED' });
  }

  await assertTeacherIsOperational(tid);

  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(query.limit) || 20));
  const offset = (page - 1) * limit;
  const status = query.status || 'all';
  const pinnedOnly = Boolean(query.pinned_only);

  const baseWhere = `sq.assigned_teacher_id = ?`;
  const baseParams = [tid];
  const filters = [];

  const statusFilter = buildStatusFilter(status);
  if (statusFilter.clause) filters.push(statusFilter.clause);

  const searchFilter = buildSearchFilter(query.search);
  if (searchFilter.clause) filters.push(searchFilter.clause);

  if (pinnedOnly) filters.push('sq.teacher_pinned_at IS NOT NULL');

  const whereSql = [baseWhere, ...filters].join(' AND ');
  const listParams = [...baseParams, ...statusFilter.params, ...searchFilter.params];

  try {
    const [countRows] = await mysqlPool.query(
      `SELECT COUNT(*) AS total
       FROM student_questions sq
       INNER JOIN users u ON u.id = sq.user_id
       LEFT JOIN courses c ON c.id = sq.course_id
       LEFT JOIN subjects s ON s.id = sq.subject_id
       WHERE ${whereSql}`,
      listParams
    );
    const total = Number(countRows[0]?.total ?? 0);
    const totalPages = total > 0 ? Math.ceil(total / limit) : 0;

    let orderSql = INBOX_ORDER;
    let selectSql = `${INBOX_SELECT} WHERE ${whereSql}`;

    let rows;
    try {
      [rows] = await mysqlPool.query(
        `${selectSql} ${orderSql} LIMIT ? OFFSET ?`,
        [...listParams, limit, offset]
      );
    } catch (error) {
      if (isMissingColumn(error, 'teacher_pinned_at')) {
        orderSql = INBOX_ORDER_FALLBACK;
        [rows] = await mysqlPool.query(
          `${selectSql} ${orderSql} LIMIT ? OFFSET ?`,
          [...listParams, limit, offset]
        );
      } else {
        throw error;
      }
    }

    const [summaryRows] = await mysqlPool.query(
      `SELECT
         SUM(CASE WHEN sq.status = 'pending' AND sq.seen_at IS NULL THEN 1 ELSE 0 END) AS sent_count,
         SUM(CASE WHEN sq.status = 'pending' AND sq.seen_at IS NOT NULL THEN 1 ELSE 0 END) AS seen_count,
         SUM(CASE WHEN sq.status = 'answered' THEN 1 ELSE 0 END) AS answered_count
       FROM student_questions sq
       WHERE sq.assigned_teacher_id = ?`,
      [tid]
    );
    const summary = summaryRows[0] || {};
    const sent = Number(summary.sent_count ?? 0);
    const seen = Number(summary.seen_count ?? 0);
    const answered = Number(summary.answered_count ?? 0);

    return {
      items: rows.map(mapInboxRow).filter(Boolean),
      pagination: {
        page,
        limit,
        total,
        total_pages: totalPages,
      },
      summary: {
        all: sent + seen + answered,
        sent,
        seen,
        answered,
        unread: sent,
      },
    };
  } catch (error) {
    if (isMissingQuestionsTable(error)) {
      return {
        items: [],
        pagination: { page: 1, limit, total: 0, total_pages: 0 },
        summary: { all: 0, sent: 0, seen: 0, answered: 0, unread: 0 },
      };
    }
    throw error;
  }
}

/**
 * Pin or unpin a question for the assigned teacher.
 */
export async function setTeacherQuestionPinned(teacherId, questionId, pinned) {
  const tid = Number(teacherId);
  const id = parseStudentQuestionId(questionId);
  if (!tid || !id) {
    throw new ApiError(404, 'Question not found', { code: 'QUESTION_NOT_FOUND' });
  }

  await assertTeacherIsOperational(tid);

  try {
    const [result] = await mysqlPool.query(
      `UPDATE student_questions
       SET teacher_pinned_at = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND assigned_teacher_id = ?`,
      [pinned ? new Date() : null, id, tid]
    );

    if (!result?.affectedRows) {
      return { kind: 'access_denied' };
    }

    return { kind: 'ok', pinned: Boolean(pinned) };
  } catch (error) {
    if (isMissingColumn(error, 'teacher_pinned_at')) {
      throw new ApiError(503, 'Pin support is not initialized', { code: 'PIN_STORAGE_UNAVAILABLE' });
    }
    if (isMissingQuestionsTable(error)) {
      throw new ApiError(404, 'Question not found', { code: 'QUESTION_NOT_FOUND' });
    }
    throw error;
  }
}
