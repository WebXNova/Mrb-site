import { mysqlPool } from '../config/mysql.js';
import { ApiError } from '../utils/apiError.js';
import { sanitizeQuestionSearchTerm } from './questionBankQueries.service.js';
import { assertTeacherIsOperational } from './teacher.service.js';
import {
  mapDbStatusToStudentStatus,
  parseStudentQuestionId,
} from './studentQuestionStudentView.service.js';
import { mapRowToTeacherQuestionDetail } from './teacherQuestionDetail.service.js';
import {
  buildTeacherQuestionThreadId,
  resolveStudentUserIdFromThreadId,
  resolveTeacherQuestionThreadId,
} from './teacherQuestionThreadRef.js';
import {
  MARK_TEACHER_THREAD_UNSEEN_SEEN_SQL,
  applySeenAtToMarkedRows,
} from './teacherQuestionSeen.service.js';
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

function mapThreadRow(row, teacherId) {
  if (!row) return null;
  const unreadCount = Number(row.unread_count ?? 0);
  const threadId =
    resolveTeacherQuestionThreadId(teacherId, row.user_id, row.stored_thread_ref) ||
    buildTeacherQuestionThreadId(teacherId, row.user_id);
  if (!threadId) return null;

  return {
    threadId,
    studentName: row.student_name ?? 'Student',
    bodyPreview: bodyPreview(row.latest_body),
    courseName: row.latest_course_name ?? 'Course',
    subjectName: row.latest_subject_name ?? 'Subject',
    messageCount: Number(row.message_count ?? 0),
    unreadCount,
    isUnread: unreadCount > 0,
    isPinned: Boolean(row.has_pinned),
    lastActivityAt: row.last_activity_at ?? null,
    latestQuestionId: Number(row.latest_question_id ?? 0) || null,
  };
}

function mapThreadMessage(row) {
  const detail = mapRowToTeacherQuestionDetail(row);
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
    courseName: detail.courseName,
    subjectName: detail.subjectName,
    createdAt: detail.createdAt,
    seenAt: detail.seenAt,
    answeredAt: detail.answeredAt,
    updatedAt: detail.updatedAt,
    canAnswer: detail.canAnswer,
    isPinned: detail.isPinned,
    isTeacherInitiated: isTeacherInitiatedBody(detail.body),
  };
}

/**
 * Paginated student thread list for teacher inbox.
 */
export async function listTeacherQuestionThreads(teacherId, query = {}) {
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

  const threadFromSql = `
    FROM student_questions sq
    INNER JOIN users u ON u.id = sq.user_id
    LEFT JOIN courses c ON c.id = sq.course_id
    LEFT JOIN subjects s ON s.id = sq.subject_id
    WHERE ${whereSql}
  `;

  const threadAggSql = `
    SELECT
      sq.user_id,
      COUNT(*) AS message_count,
      SUM(CASE WHEN sq.status = 'pending' AND sq.seen_at IS NULL THEN 1 ELSE 0 END) AS unread_count,
      MAX(sq.updated_at) AS last_activity_at,
      MAX(sq.teacher_pinned_at IS NOT NULL) AS has_pinned,
      MAX(sq.teacher_pinned_at) AS latest_pin_at,
      SUBSTRING_INDEX(
        GROUP_CONCAT(sq.id ORDER BY sq.updated_at DESC, sq.id DESC SEPARATOR '\x1e'),
        '\x1e',
        1
      ) AS latest_question_id
    ${threadFromSql}
    GROUP BY sq.user_id
  `;

  const threadSelectSql = `
    SELECT
      agg.user_id,
      u.full_name AS student_name,
      agg.message_count,
      agg.unread_count,
      agg.last_activity_at,
      agg.has_pinned,
      agg.latest_pin_at,
      latest.body AS latest_body,
      latest.id AS latest_question_id,
      latest.teacher_thread_ref AS stored_thread_ref,
      COALESCE(lc.title, 'Course') AS latest_course_name,
      COALESCE(ls.title, latest.subject, 'Subject') AS latest_subject_name
    FROM (${threadAggSql}) AS agg
    INNER JOIN users u ON u.id = agg.user_id
    INNER JOIN student_questions latest ON latest.id = agg.latest_question_id
    LEFT JOIN courses lc ON lc.id = latest.course_id
    LEFT JOIN subjects ls ON ls.id = latest.subject_id
  `;

  let orderSql = `
    ORDER BY
      has_pinned DESC,
      latest_pin_at DESC,
      unread_count DESC,
      last_activity_at DESC
  `;

  try {
    const [countRows] = await mysqlPool.query(
      `SELECT COUNT(DISTINCT sq.user_id) AS total
       ${threadFromSql}`,
      listParams
    );
    const total = Number(countRows[0]?.total ?? 0);
    const totalPages = total > 0 ? Math.ceil(total / limit) : 0;

    let rows;
    try {
      [rows] = await mysqlPool.query(
        `${threadSelectSql} ${orderSql} LIMIT ? OFFSET ?`,
        [...listParams, limit, offset]
      );
    } catch (error) {
      if (isMissingColumn(error, 'teacher_pinned_at')) {
        orderSql = `
          ORDER BY
            unread_count DESC,
            last_activity_at DESC
        `;
        const fallbackAggSql = `
          SELECT
            sq.user_id,
            COUNT(*) AS message_count,
            SUM(CASE WHEN sq.status = 'pending' AND sq.seen_at IS NULL THEN 1 ELSE 0 END) AS unread_count,
            MAX(sq.updated_at) AS last_activity_at,
            0 AS has_pinned,
            NULL AS latest_pin_at,
            SUBSTRING_INDEX(
              GROUP_CONCAT(sq.id ORDER BY sq.updated_at DESC, sq.id DESC SEPARATOR '\x1e'),
              '\x1e',
              1
            ) AS latest_question_id
          ${threadFromSql}
          GROUP BY sq.user_id
        `;
        const fallbackSelectSql = `
          SELECT
            agg.user_id,
            u.full_name AS student_name,
            agg.message_count,
            agg.unread_count,
            agg.last_activity_at,
            agg.has_pinned,
            agg.latest_pin_at,
            latest.body AS latest_body,
            latest.id AS latest_question_id,
            latest.teacher_thread_ref AS stored_thread_ref,
            COALESCE(lc.title, 'Course') AS latest_course_name,
            COALESCE(ls.title, latest.subject, 'Subject') AS latest_subject_name
          FROM (${fallbackAggSql}) AS agg
          INNER JOIN users u ON u.id = agg.user_id
          INNER JOIN student_questions latest ON latest.id = agg.latest_question_id
          LEFT JOIN courses lc ON lc.id = latest.course_id
          LEFT JOIN subjects ls ON ls.id = latest.subject_id
        `;
        [rows] = await mysqlPool.query(
          `${fallbackSelectSql} ${orderSql} LIMIT ? OFFSET ?`,
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
      items: rows.map((row) => mapThreadRow(row, tid)).filter(Boolean),
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
 * Open a student thread, mark unseen questions as seen, return chronological messages.
 */
export async function openTeacherQuestionThread(teacherId, threadId) {
  const tid = Number(teacherId);
  const ref = String(threadId || '').trim();
  if (!tid || !ref) {
    return { kind: 'invalid_id' };
  }

  await assertTeacherIsOperational(tid);

  const studentUserId = await resolveStudentUserIdFromThreadId(mysqlPool, tid, ref);
  if (!studentUserId) {
    return { kind: 'access_denied' };
  }

  const connection = await mysqlPool.getConnection();
  try {
    await connection.beginTransaction();

    const [rows] = await connection.query(
      `${THREAD_MESSAGE_SELECT}
       WHERE sq.user_id = ? AND sq.assigned_teacher_id = ?
       ORDER BY sq.created_at ASC, sq.id ASC
       FOR UPDATE`,
      [studentUserId, tid]
    );

    if (!rows.length) {
      await connection.rollback();
      return { kind: 'access_denied' };
    }

    let statusUpdated = false;
    const [updateResult] = await connection.query(MARK_TEACHER_THREAD_UNSEEN_SEEN_SQL, [
      studentUserId,
      tid,
    ]);
    const affected = Number(updateResult?.affectedRows ?? 0);
    if (affected > 0) {
      statusUpdated = applySeenAtToMarkedRows(rows, affected, mapDbStatusToStudentStatus);
    }

    await connection.commit();

    const messages = rows.map(mapThreadMessage).filter(Boolean);
    const activeQuestion = messages.find((msg) => msg.canAnswer) ?? null;
    const latest = messages[messages.length - 1] ?? null;

    return {
      kind: 'ok',
      statusUpdated,
      thread: {
        threadId: ref,
        studentName: rows[0]?.student_name ?? 'Student',
        courseName: latest?.courseName ?? rows[0]?.course_name ?? 'Course',
        subjectName: latest?.subjectName ?? 'Subject',
        messageCount: messages.length,
        unreadCount: 0,
        lastActivityAt: latest?.updatedAt ?? latest?.createdAt ?? null,
        activeQuestionId: activeQuestion?.id ?? null,
        messages,
        context: {
          studentName: rows[0]?.student_name ?? 'Student',
          courseName: latest?.courseName ?? 'Course',
          subjectName: latest?.subjectName ?? 'Subject',
          questionCount: messages.length,
          lastActivityAt: latest?.updatedAt ?? latest?.createdAt ?? null,
        },
      },
    };
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

/**
 * Resolve thread id from a question the teacher owns.
 */
export async function resolveTeacherThreadIdFromQuestion(teacherId, questionId) {
  const tid = Number(teacherId);
  const id = parseStudentQuestionId(questionId);
  if (!tid || !id) return null;

  await assertTeacherIsOperational(tid);

  try {
    const [rows] = await mysqlPool.query(
      `SELECT user_id, teacher_thread_ref
       FROM student_questions
       WHERE id = ? AND assigned_teacher_id = ?
       LIMIT 1`,
      [id, tid]
    );
    if (!rows[0]) return null;
    return resolveTeacherQuestionThreadId(tid, rows[0].user_id, rows[0].teacher_thread_ref);
  } catch (error) {
    if (isMissingQuestionsTable(error)) return null;
    throw error;
  }
}
