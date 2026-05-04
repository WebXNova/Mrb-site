import path from 'path';
import { mysqlPool } from '../config/mysql.js';
import { ApiError } from '../utils/apiError.js';

const SUBJECTS = new Set(['physics', 'chemistry', 'biology', 'english', 'logical_reasoning']);
const MIN_WORDS_TEXT_ONLY = 10;
const MIN_WORDS_WITH_IMAGE = 5;

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    subject: row.subject,
    title: row.title,
    body: row.body,
    attachmentUrl: row.attachment_url ?? null,
    answer: row.answer,
    status: row.status,
    answeredAt: row.answered_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    studentName: row.student_name ?? null,
    studentEmail: row.student_email ?? null,
  };
}

function countWords(text) {
  return String(text || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function normalizeAttachmentUrl(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === '') return null;
  const s = String(raw).trim();
  if (!s.startsWith('/api/uploads/student-qa/')) {
    throw new ApiError(400, 'Invalid attachment URL');
  }
  if (s.includes('..')) {
    throw new ApiError(400, 'Invalid attachment URL');
  }
  const base = path.posix.basename(s);
  if (!/^[a-zA-Z0-9._-]+$/.test(base)) {
    throw new ApiError(400, 'Invalid attachment URL');
  }
  return s;
}

function deriveTitle(body) {
  const oneLine = body.replace(/\s+/g, ' ').trim();
  if (oneLine.length <= 120) return oneLine;
  return `${oneLine.slice(0, 117)}…`;
}

function isMissingQuestionsTable(error) {
  return error?.code === 'ER_NO_SUCH_TABLE' && String(error?.sqlMessage || '').includes('student_questions');
}

export async function createStudentQuestion(userId, { subject, body, imageUrl }) {
  const s = String(subject || '').toLowerCase().trim();
  if (!SUBJECTS.has(s)) {
    throw new ApiError(
      400,
      'Subject must be physics, chemistry, biology, english, or logical_reasoning',
    );
  }
  const trimmed = String(body || '').trim();
  if (trimmed.length > 12000) {
    throw new ApiError(400, 'Question is too long');
  }
  const attachmentUrl = normalizeAttachmentUrl(imageUrl);
  const words = countWords(trimmed);
  const minWords = attachmentUrl ? MIN_WORDS_WITH_IMAGE : MIN_WORDS_TEXT_ONLY;
  if (words < minWords) {
    throw new ApiError(
      400,
      attachmentUrl
        ? `Please write at least ${MIN_WORDS_WITH_IMAGE} words to describe your image (you have ${words}).`
        : `Please write at least ${MIN_WORDS_TEXT_ONLY} words in your question (you have ${words}).`,
    );
  }
  const title = deriveTitle(trimmed);
  try {
    const [result] = await mysqlPool.query(
      `INSERT INTO student_questions (user_id, subject, title, body, attachment_url) VALUES (?, ?, ?, ?, ?)`,
      [userId, s, title, trimmed, attachmentUrl]
    );
    const [rows] = await mysqlPool.query(`SELECT * FROM student_questions WHERE id = ? LIMIT 1`, [result.insertId]);
    return mapRow(rows[0]);
  } catch (error) {
    if (isMissingQuestionsTable(error)) {
      throw new ApiError(503, 'Q&A storage is not initialized. Run database schema migration (student_questions table).');
    }
    throw error;
  }
}

export async function listStudentQuestions(userId) {
  try {
    const [rows] = await mysqlPool.query(
      `SELECT * FROM student_questions WHERE user_id = ? ORDER BY updated_at DESC, id DESC`,
      [userId]
    );
    return rows.map(mapRow);
  } catch (error) {
    if (isMissingQuestionsTable(error)) return [];
    throw error;
  }
}

export async function getStudentQuestionForUser(userId, questionId) {
  const id = Number(questionId);
  if (!id) return null;
  try {
    const [rows] = await mysqlPool.query(
      `SELECT * FROM student_questions WHERE id = ? AND user_id = ? LIMIT 1`,
      [id, userId]
    );
    return mapRow(rows[0]);
  } catch (error) {
    if (isMissingQuestionsTable(error)) return null;
    throw error;
  }
}

export async function countStudentQuestions(userId) {
  try {
    const [rows] = await mysqlPool.query(
      `SELECT COUNT(*) AS c FROM student_questions WHERE user_id = ?`,
      [userId]
    );
    return Number(rows[0]?.c || 0);
  } catch (error) {
    if (error?.code === 'ER_NO_SUCH_TABLE') return 0;
    throw error;
  }
}

export async function listAdminStudentQuestions(subjectFilter) {
  const params = [];
  let where = '1=1';
  if (subjectFilter && subjectFilter !== 'all') {
    const s = String(subjectFilter).toLowerCase().trim();
    if (!SUBJECTS.has(s)) {
      throw new ApiError(400, 'Invalid subject filter');
    }
    where += ' AND sq.subject = ?';
    params.push(s);
  }
  try {
    const [rows] = await mysqlPool.query(
      `SELECT sq.*, u.full_name AS student_name, u.email AS student_email
       FROM student_questions sq
       INNER JOIN users u ON u.id = sq.user_id
       WHERE ${where}
       ORDER BY CASE sq.status WHEN 'pending' THEN 0 ELSE 1 END, sq.updated_at DESC, sq.id DESC`,
      params
    );
    return rows.map(mapRow);
  } catch (error) {
    if (isMissingQuestionsTable(error)) return [];
    throw error;
  }
}

export async function adminUpdateStudentQuestionAnswer(adminUserId, questionId, { answer }) {
  const id = Number(questionId);
  if (!id) throw new ApiError(400, 'Invalid question id');
  const trimmed = String(answer ?? '').trim();
  if (trimmed.length < 1) {
    throw new ApiError(400, 'Answer cannot be empty');
  }
  if (trimmed.length > 32000) {
    throw new ApiError(400, 'Answer is too long');
  }
  try {
    const [result] = await mysqlPool.query(
      `UPDATE student_questions
       SET answer = ?, status = 'answered', answered_by = ?, answered_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [trimmed, adminUserId, id]
    );
    if (result.affectedRows === 0) {
      throw new ApiError(404, 'Question not found');
    }
    const [rows] = await mysqlPool.query(
      `SELECT sq.*, u.full_name AS student_name, u.email AS student_email
       FROM student_questions sq
       INNER JOIN users u ON u.id = sq.user_id
       WHERE sq.id = ? LIMIT 1`,
      [id]
    );
    return mapRow(rows[0]);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (isMissingQuestionsTable(error)) {
      throw new ApiError(503, 'Q&A storage is not initialized. Run database schema migration (student_questions table).');
    }
    throw error;
  }
}

export async function adminDeleteStudentQuestion(questionId) {
  const id = Number(questionId);
  if (!id) throw new ApiError(400, 'Invalid question id');
  try {
    const [result] = await mysqlPool.query(`DELETE FROM student_questions WHERE id = ?`, [id]);
    if (result.affectedRows === 0) {
      throw new ApiError(404, 'Question not found');
    }
    return true;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (isMissingQuestionsTable(error)) {
      throw new ApiError(503, 'Q&A storage is not initialized. Run database schema migration (student_questions table).');
    }
    throw error;
  }
}
