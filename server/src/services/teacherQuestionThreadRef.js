import { createHmac } from 'crypto';
import { getTeacherThreadSecrets } from '../security/teacherThreadSecret.js';

const THREAD_ID_LENGTH = 22;

/**
 * @param {number} teacherId
 * @param {number} studentUserId
 * @param {string} secret
 */
export function buildTeacherQuestionThreadIdWithSecret(teacherId, studentUserId, secret) {
  const tid = Number(teacherId);
  const sid = Number(studentUserId);
  if (!tid || !sid || !secret) return null;
  return createHmac('sha256', secret)
    .update(`t:${tid}:s:${sid}`)
    .digest('base64url')
    .slice(0, THREAD_ID_LENGTH);
}

/**
 * Build opaque thread id using the current (active) HMAC secret only.
 */
export function buildTeacherQuestionThreadId(teacherId, studentUserId) {
  return buildTeacherQuestionThreadIdWithSecret(
    teacherId,
    studentUserId,
    getTeacherThreadSecrets().current
  );
}

/**
 * Resolve thread id trying current secret first, then previous secrets (rotation window).
 *
 * @param {number} teacherId
 * @param {number} studentUserId
 * @param {string|null|undefined} [storedRef] — persisted teacher_thread_ref from DB
 */
export function resolveTeacherQuestionThreadId(teacherId, studentUserId, storedRef) {
  const ref = String(storedRef || '').trim();
  if (ref) return ref;

  return buildTeacherQuestionThreadId(teacherId, studentUserId);
}

function isMissingColumn(error, column) {
  return error?.code === 'ER_BAD_FIELD_ERROR' && String(error?.sqlMessage || '').includes(column);
}

/**
 * O(1) indexed lookup when teacher_thread_ref is populated; multi-secret HMAC scan as fallback.
 */
export async function resolveStudentUserIdFromThreadId(mysqlPool, teacherId, threadId) {
  const tid = Number(teacherId);
  const ref = String(threadId || '').trim();
  if (!tid || !ref) return null;

  try {
    const [indexed] = await mysqlPool.query(
      `SELECT user_id
       FROM student_questions
       WHERE assigned_teacher_id = ? AND teacher_thread_ref = ?
       LIMIT 1`,
      [tid, ref]
    );
    if (indexed[0]?.user_id) {
      return Number(indexed[0].user_id);
    }
  } catch (error) {
    if (!isMissingColumn(error, 'teacher_thread_ref')) {
      throw error;
    }
  }

  const [rows] = await mysqlPool.query(
    `SELECT DISTINCT user_id
     FROM student_questions
     WHERE assigned_teacher_id = ?`,
    [tid]
  );

  const secrets = getTeacherThreadSecrets().all;
  for (const row of rows) {
    for (const secret of secrets) {
      const candidate = buildTeacherQuestionThreadIdWithSecret(tid, row.user_id, secret);
      if (candidate === ref) return Number(row.user_id);
    }
  }
  return null;
}
