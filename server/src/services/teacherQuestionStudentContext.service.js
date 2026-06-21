import { mysqlPool } from '../config/mysql.js';
import { ApiError } from '../utils/apiError.js';
import { assertTeacherIsOperational } from './teacher.service.js';
import { parseStudentQuestionId } from './studentQuestionStudentView.service.js';

function resolveSubjectLabel(row) {
  const title = String(row?.subject_title || '').trim();
  if (title) return title;
  const slug = String(row?.subject || '').trim();
  if (!slug) return 'Subject';
  return slug.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function isMissingQuestionsTable(error) {
  return error?.code === 'ER_NO_SUCH_TABLE' && String(error?.sqlMessage || '').includes('student_questions');
}

/**
 * Student context for teacher workspace right panel — no internal IDs exposed.
 */
export async function getTeacherQuestionStudentContext(teacherId, questionId) {
  const tid = Number(teacherId);
  const id = parseStudentQuestionId(questionId);
  if (!tid || !id) return null;

  await assertTeacherIsOperational(tid);

  try {
    const [rows] = await mysqlPool.query(
      `SELECT
         sq.id,
         sq.subject,
         sq.updated_at,
         u.full_name AS student_name,
         c.title AS course_name,
         s.title AS subject_title,
         sq.user_id
       FROM student_questions sq
       INNER JOIN users u ON u.id = sq.user_id
       LEFT JOIN courses c ON c.id = sq.course_id
       LEFT JOIN subjects s ON s.id = sq.subject_id
       WHERE sq.id = ? AND sq.assigned_teacher_id = ?
       LIMIT 1`,
      [id, tid]
    );

    if (!rows[0]) return null;

    const row = rows[0];
    const studentUserId = Number(row.user_id);

    const [countRows] = await mysqlPool.query(
      `SELECT
         COUNT(*) AS question_count,
         MAX(updated_at) AS last_activity_at
       FROM student_questions
       WHERE user_id = ? AND assigned_teacher_id = ?`,
      [studentUserId, tid]
    );

    const stats = countRows[0] || {};

    return {
      studentName: row.student_name ?? 'Student',
      courseName: row.course_name ?? 'Course',
      subjectName: resolveSubjectLabel(row),
      questionCount: Number(stats.question_count ?? 0),
      lastActivityAt: stats.last_activity_at ?? row.updated_at ?? null,
    };
  } catch (error) {
    if (isMissingQuestionsTable(error)) return null;
    throw error;
  }
}
