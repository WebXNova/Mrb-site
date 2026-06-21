import { mysqlPool } from '../config/mysql.js';
import { ApiError } from '../utils/apiError.js';
import { mapActivityRow } from './teacherActivityLog.service.js';
import { mapAnswerRow } from './teacherAnswer.service.js';

const SUBJECTS = new Set(['physics', 'chemistry', 'biology', 'english', 'logical_reasoning']);

function parseJson(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function mapMonitoringQuestionRow(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    studentId: Number(row.user_id),
    studentName: row.student_name ?? null,
    studentEmail: row.student_email ?? null,
    teacherId: row.assigned_teacher_id != null ? Number(row.assigned_teacher_id) : null,
    teacherName: row.teacher_name ?? null,
    subjectId: row.subject_id != null ? Number(row.subject_id) : null,
    courseId: row.course_id != null ? Number(row.course_id) : null,
    subject: row.subject,
    subjectTitle: row.subject_title ?? null,
    courseName: row.course_name ?? null,
    question: row.body,
    title: row.title,
    status: String(row.status || 'pending').toUpperCase(),
    answer: row.answer ?? null,
    answeredAt: row.answered_at ?? null,
    answeredBy: row.answered_by != null ? Number(row.answered_by) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    responseTimeSeconds:
      row.response_time_seconds != null ? Number(row.response_time_seconds) : null,
  };
}

function buildQuestionWhere(filters) {
  const clauses = ['1=1'];
  const params = [];

  if (filters.status) {
    clauses.push('sq.status = ?');
    params.push(filters.status);
  }
  if (filters.teacherId) {
    clauses.push('sq.assigned_teacher_id = ?');
    params.push(filters.teacherId);
  }
  if (filters.studentId) {
    clauses.push('sq.user_id = ?');
    params.push(filters.studentId);
  }
  if (filters.subjectId) {
    clauses.push('sq.subject_id = ?');
    params.push(filters.subjectId);
  }
  if (filters.courseId) {
    clauses.push('sq.course_id = ?');
    params.push(filters.courseId);
  }
  if (filters.subject) {
    const s = String(filters.subject).toLowerCase().trim();
    if (!SUBJECTS.has(s)) {
      throw new ApiError(400, 'Invalid subject filter', { code: 'INVALID_SUBJECT' });
    }
    clauses.push('sq.subject = ?');
    params.push(s);
  }
  if (filters.search) {
    const term = `%${filters.search.trim()}%`;
    clauses.push('(sq.title LIKE ? OR sq.body LIKE ? OR u.full_name LIKE ? OR u.email LIKE ?)');
    params.push(term, term, term, term);
  }
  if (filters.dateFrom) {
    clauses.push('sq.created_at >= ?');
    params.push(`${filters.dateFrom} 00:00:00`);
  }
  if (filters.dateTo) {
    clauses.push('sq.created_at <= ?');
    params.push(`${filters.dateTo} 23:59:59`);
  }

  return { where: clauses.join(' AND '), params };
}

function buildAnswerWhere(filters) {
  const clauses = ['1=1'];
  const params = [];

  if (filters.teacherId) {
    clauses.push('ta.teacher_id = ?');
    params.push(filters.teacherId);
  }
  if (filters.questionId) {
    clauses.push('ta.question_id = ?');
    params.push(filters.questionId);
  }
  if (filters.search) {
    const term = `%${filters.search.trim()}%`;
    clauses.push('(ta.answer LIKE ? OR tu.full_name LIKE ?)');
    params.push(term, term);
  }
  if (filters.dateFrom) {
    clauses.push('ta.created_at >= ?');
    params.push(`${filters.dateFrom} 00:00:00`);
  }
  if (filters.dateTo) {
    clauses.push('ta.created_at <= ?');
    params.push(`${filters.dateTo} 23:59:59`);
  }

  return { where: clauses.join(' AND '), params };
}

function buildActivityWhere(filters) {
  const clauses = ['1=1'];
  const params = [];

  if (filters.teacherId) {
    clauses.push('tal.teacher_id = ?');
    params.push(filters.teacherId);
  }
  if (filters.questionId) {
    clauses.push('tal.question_id = ?');
    params.push(filters.questionId);
  }
  if (filters.actionType) {
    clauses.push('tal.action_type = ?');
    params.push(filters.actionType);
  }
  if (filters.dateFrom) {
    clauses.push('tal.created_at >= ?');
    params.push(`${filters.dateFrom} 00:00:00`);
  }
  if (filters.dateTo) {
    clauses.push('tal.created_at <= ?');
    params.push(`${filters.dateTo} 23:59:59`);
  }

  return { where: clauses.join(' AND '), params };
}

function paginationMeta(page, limit, total) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return { page, limit, total, totalPages };
}

function isMissingTable(error, table) {
  return error?.code === 'ER_NO_SUCH_TABLE' && String(error?.sqlMessage || '').includes(table);
}

const QUESTION_SELECT = `
  SELECT
    sq.id,
    sq.user_id,
    sq.assigned_teacher_id,
    sq.subject_id,
    sq.course_id,
    sq.subject,
    sq.title,
    sq.body,
    sq.answer,
    sq.status,
    sq.answered_by,
    sq.answered_at,
    sq.created_at,
    sq.updated_at,
    u.full_name AS student_name,
    u.email AS student_email,
    tu.full_name AS teacher_name,
    c.title AS course_name,
    s.title AS subject_title,
    TIMESTAMPDIFF(SECOND, sq.created_at, COALESCE(ta.created_at, sq.answered_at)) AS response_time_seconds
  FROM student_questions sq
  INNER JOIN users u ON u.id = sq.user_id
  LEFT JOIN users tu ON tu.id = sq.assigned_teacher_id
  LEFT JOIN courses c ON c.id = sq.course_id
  LEFT JOIN subjects s ON s.id = sq.subject_id
  LEFT JOIN teacher_answers ta ON ta.question_id = sq.id
`;

/**
 * Admin read-only: paginated question list with server-side filters.
 */
export async function listMonitoringQuestions(filters, { page, limit }) {
  const { where, params } = buildQuestionWhere(filters);
  const offset = (page - 1) * limit;

  try {
    const [countRows] = await mysqlPool.query(
      `SELECT COUNT(*) AS total
       FROM student_questions sq
       INNER JOIN users u ON u.id = sq.user_id
       WHERE ${where}`,
      params
    );
    const total = Number(countRows[0]?.total ?? 0);

    const [rows] = await mysqlPool.query(
      `${QUESTION_SELECT}
       WHERE ${where}
       ORDER BY sq.created_at DESC, sq.id DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    return {
      items: rows.map(mapMonitoringQuestionRow),
      pagination: paginationMeta(page, limit, total),
    };
  } catch (error) {
    if (isMissingTable(error, 'student_questions')) {
      return { items: [], pagination: paginationMeta(page, limit, 0) };
    }
    throw error;
  }
}

/**
 * Admin read-only: single question detail.
 */
export async function getMonitoringQuestionById(questionId) {
  const id = Number(questionId);
  if (!id) return null;

  try {
    const [rows] = await mysqlPool.query(
      `${QUESTION_SELECT}
       WHERE sq.id = ?
       LIMIT 1`,
      [id]
    );
    return mapMonitoringQuestionRow(rows[0]);
  } catch (error) {
    if (isMissingTable(error, 'student_questions')) return null;
    throw error;
  }
}

/**
 * Admin read-only: paginated teacher answers.
 */
export async function listMonitoringAnswers(filters, { page, limit }) {
  const { where, params } = buildAnswerWhere(filters);
  const offset = (page - 1) * limit;

  try {
    const [countRows] = await mysqlPool.query(
      `SELECT COUNT(*) AS total
       FROM teacher_answers ta
       INNER JOIN users tu ON tu.id = ta.teacher_id
       WHERE ${where}`,
      params
    );
    const total = Number(countRows[0]?.total ?? 0);

    const [rows] = await mysqlPool.query(
      `SELECT
         ta.*,
         tu.full_name AS teacher_name,
         tu.email AS teacher_email,
         sq.title AS question_title,
         sq.status AS question_status,
         u.full_name AS student_name
       FROM teacher_answers ta
       INNER JOIN users tu ON tu.id = ta.teacher_id
       INNER JOIN student_questions sq ON sq.id = ta.question_id
       INNER JOIN users u ON u.id = sq.user_id
       WHERE ${where}
       ORDER BY ta.created_at DESC, ta.id DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    return {
      items: rows.map((row) => ({
        ...mapAnswerRow(row),
        teacherName: row.teacher_name ?? null,
        teacherEmail: row.teacher_email ?? null,
        questionTitle: row.question_title ?? null,
        questionStatus: row.question_status ?? null,
        studentName: row.student_name ?? null,
      })),
      pagination: paginationMeta(page, limit, total),
    };
  } catch (error) {
    if (isMissingTable(error, 'teacher_answers')) {
      return { items: [], pagination: paginationMeta(page, limit, 0) };
    }
    throw error;
  }
}

/**
 * Admin read-only: paginated teacher activity logs.
 */
export async function listMonitoringTeacherActivity(filters, { page, limit }) {
  const { where, params } = buildActivityWhere(filters);
  const offset = (page - 1) * limit;

  try {
    const [countRows] = await mysqlPool.query(
      `SELECT COUNT(*) AS total
       FROM teacher_activity_logs tal
       WHERE ${where}`,
      params
    );
    const total = Number(countRows[0]?.total ?? 0);

    const [rows] = await mysqlPool.query(
      `SELECT
         tal.*,
         u.full_name AS teacher_name,
         u.email AS teacher_email
       FROM teacher_activity_logs tal
       INNER JOIN users u ON u.id = tal.teacher_id
       WHERE ${where}
       ORDER BY tal.created_at DESC, tal.id DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    return {
      items: rows.map(mapActivityRow),
      pagination: paginationMeta(page, limit, total),
    };
  } catch (error) {
    if (isMissingTable(error, 'teacher_activity_logs')) {
      return { items: [], pagination: paginationMeta(page, limit, 0) };
    }
    throw error;
  }
}

function csvEscape(value) {
  const s = value == null ? '' : String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function rowsToCsv(headers, rows) {
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => csvEscape(row[h])).join(','));
  }
  return `${lines.join('\n')}\n`;
}

/**
 * Export monitoring data (capped row limit for performance).
 */
export async function exportMonitoringReport(query) {
  const limit = query.limit ?? 5000;

  if (query.type === 'answers') {
    const result = await listMonitoringAnswers(query, { page: 1, limit });
    const rows = result.items.map((item) => ({
      id: item.id,
      questionId: item.questionId,
      teacherId: item.teacherId,
      teacherName: item.teacherName,
      studentName: item.studentName,
      answer: item.answer,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    }));
    if (query.format === 'json') return { format: 'json', rows };
    return {
      format: 'csv',
      content: rowsToCsv(
        ['id', 'questionId', 'teacherId', 'teacherName', 'studentName', 'answer', 'createdAt', 'updatedAt'],
        rows
      ),
    };
  }

  if (query.type === 'activity') {
    const result = await listMonitoringTeacherActivity(query, { page: 1, limit });
    const rows = result.items.map((item) => ({
      id: item.id,
      teacherId: item.teacherId,
      teacherName: item.teacherName,
      questionId: item.questionId,
      actionType: item.actionType,
      createdAt: item.createdAt,
      metadata: JSON.stringify(item.metadata ?? {}),
    }));
    if (query.format === 'json') return { format: 'json', rows };
    return {
      format: 'csv',
      content: rowsToCsv(
        ['id', 'teacherId', 'teacherName', 'questionId', 'actionType', 'createdAt', 'metadata'],
        rows
      ),
    };
  }

  const result = await listMonitoringQuestions(query, { page: 1, limit });
  const rows = result.items.map((item) => ({
    id: item.id,
    studentId: item.studentId,
    studentName: item.studentName,
    teacherId: item.teacherId,
    teacherName: item.teacherName,
    subject: item.subject,
    status: item.status,
    question: item.question,
    answer: item.answer,
    responseTimeSeconds: item.responseTimeSeconds,
    createdAt: item.createdAt,
    answeredAt: item.answeredAt,
  }));
  if (query.format === 'json') return { format: 'json', rows };
  return {
    format: 'csv',
    content: rowsToCsv(
      [
        'id',
        'studentId',
        'studentName',
        'teacherId',
        'teacherName',
        'subject',
        'status',
        'question',
        'answer',
        'responseTimeSeconds',
        'createdAt',
        'answeredAt',
      ],
      rows
    ),
  };
}

/**
 * Service-level guard: admin monitoring is read-only.
 */
export function assertAdminQaMonitoringReadOnly() {
  throw new ApiError(403, 'Admin Q&A monitoring is read-only. Teachers publish answers directly.', {
    code: 'QA_MONITORING_READ_ONLY',
  });
}

export { mapMonitoringQuestionRow, parseJson };
