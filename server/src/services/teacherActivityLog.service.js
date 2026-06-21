import { mysqlPool } from '../config/mysql.js';
import {
  isValidTeacherActivityAction,
  TEACHER_ACTIVITY_ACTIONS,
} from '../constants/teacherActivity.schema.js';
import { sanitizeMetadata } from '../utils/logSanitizer.js';

function parseJson(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function mapActivityRow(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    teacherId: Number(row.teacher_id),
    teacherName: row.teacher_name ?? null,
    teacherEmail: row.teacher_email ?? null,
    questionId: row.question_id != null ? Number(row.question_id) : null,
    actionType: row.action_type,
    metadata: parseJson(row.metadata_json),
    createdAt: row.created_at,
  };
}

function isMissingTable(error, table) {
  return error?.code === 'ER_NO_SUCH_TABLE' && String(error?.sqlMessage || '').includes(table);
}

/**
 * Persist a teacher activity event. Never throws — monitoring must not break core flows.
 *
 * @param {{
 *   teacherId: number,
 *   actionType: string,
 *   questionId?: number|null,
 *   metadata?: Record<string, unknown>,
 * }} input
 */
export async function writeTeacherActivityLog({
  teacherId,
  actionType,
  questionId = null,
  metadata = {},
}) {
  const tid = Number(teacherId);
  const action = String(actionType || '').toUpperCase();
  if (!tid || !isValidTeacherActivityAction(action)) {
    return { ok: false, persisted: false };
  }

  const qid = questionId != null ? Number(questionId) : null;
  const safeMetadata = sanitizeMetadata(metadata);

  try {
    await mysqlPool.query(
      `INSERT INTO teacher_activity_logs (teacher_id, question_id, action_type, metadata_json)
       VALUES (?, ?, ?, ?)`,
      [tid, qid || null, action, JSON.stringify(safeMetadata)]
    );
    return { ok: true, persisted: true };
  } catch (error) {
    if (isMissingTable(error, 'teacher_activity_logs')) {
      return { ok: false, persisted: false };
    }
    console.error('[teacherActivityLog] persist failed:', error?.message || error);
    return { ok: false, persisted: false };
  }
}

/**
 * @param {import('express').Request} req
 * @param {Omit<Parameters<typeof writeTeacherActivityLog>[0], 'teacherId'> & { teacherId?: number }} input
 */
export async function writeTeacherActivityLogFromReq(req, input) {
  return writeTeacherActivityLog({
    teacherId: input.teacherId ?? req?.user?.id ?? null,
    actionType: input.actionType,
    questionId: input.questionId ?? null,
    metadata: {
      route: req?.originalUrl || req?.path || null,
      requestId: req?.requestId ?? null,
      ...(input.metadata ?? {}),
    },
  });
}

export async function logTeacherLogin(teacherId, metadata = {}) {
  return writeTeacherActivityLog({
    teacherId,
    actionType: TEACHER_ACTIVITY_ACTIONS.LOGIN,
    metadata,
  });
}

export async function logTeacherLogout(teacherId, metadata = {}) {
  return writeTeacherActivityLog({
    teacherId,
    actionType: TEACHER_ACTIVITY_ACTIONS.LOGOUT,
    metadata,
  });
}

export async function logTeacherQuestionViewed(teacherId, questionId, metadata = {}) {
  return writeTeacherActivityLog({
    teacherId,
    actionType: TEACHER_ACTIVITY_ACTIONS.QUESTION_VIEWED,
    questionId,
    metadata,
  });
}

export async function logTeacherQuestionAnswered(teacherId, questionId, metadata = {}) {
  return writeTeacherActivityLog({
    teacherId,
    actionType: TEACHER_ACTIVITY_ACTIONS.QUESTION_ANSWERED,
    questionId,
    metadata,
  });
}

export async function logTeacherAnswerUpdated(teacherId, questionId, metadata = {}) {
  return writeTeacherActivityLog({
    teacherId,
    actionType: TEACHER_ACTIVITY_ACTIONS.ANSWER_UPDATED,
    questionId,
    metadata,
  });
}

export { mapActivityRow, parseJson };
