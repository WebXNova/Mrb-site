import { ApiError } from '../utils/apiError.js';
import { logActivity } from './activityLog.service.js';
import { isTeacherOperationalStatus } from '../utils/teacherStatus.js';

/** Public-facing failure — never expose mapping or teacher inventory details. */
export const TEACHER_UNAVAILABLE_PUBLIC_MESSAGE =
  'No teacher is available for this subject right now. Please try again later or contact support.';

/** Load-balancing strategy identifier (observability / audit). */
export const TEACHER_ASSIGNMENT_STRATEGY = 'least_pending_load';

/**
 * @typedef {Object} TeacherAssignmentResult
 * @property {number} teacherId
 * @property {number} subjectId
 * @property {string} subjectTitle
 * @property {string} strategy
 */

/**
 * @typedef {Object} TeacherAssignmentAuditContext
 * @property {number|null} [studentId]
 * @property {string|null} [clientIp]
 * @property {string|null} [requestId]
 */

/**
 * Load subject scoped to an entitled course. Subject must exist and be active.
 * @param {number} subjectId
 * @param {number} courseId
 * @param {import('mysql2/promise').PoolConnection} connection
 */
async function loadAssignableSubject(subjectId, courseId, connection) {
  const sid = Number(subjectId);
  const cid = Number(courseId);
  if (!sid || !cid) {
    throw new ApiError(422, 'Subject not found for your course', { code: 'SUBJECT_NOT_IN_COURSE' });
  }

  const [rows] = await connection.query(
    `SELECT id, course_id, title, is_active
     FROM subjects
     WHERE id = ? AND course_id = ?
     LIMIT 1`,
    [sid, cid]
  );

  if (!rows[0]) {
    throw new ApiError(422, 'Subject not found for your course', { code: 'SUBJECT_NOT_IN_COURSE' });
  }
  if (!rows[0].is_active) {
    throw new ApiError(422, 'This subject is not available for questions', { code: 'SUBJECT_INACTIVE' });
  }

  return rows[0];
}

/**
 * Operational teachers for a subject via teacher_subjects, ordered for least-load routing.
 * @param {number} subjectId
 * @param {import('mysql2/promise').PoolConnection} connection
 */
async function listEligibleTeachersOrdered(subjectId, connection) {
  const sid = Number(subjectId);
  if (!sid) return [];

  try {
    const [rows] = await connection.query(
      `SELECT u.id,
              u.status,
              COALESCE(loads.pending_count, 0) AS pending_count
       FROM teacher_subjects ts
       INNER JOIN users u ON u.id = ts.teacher_id
       LEFT JOIN (
         SELECT assigned_teacher_id, COUNT(*) AS pending_count
         FROM student_questions
         WHERE subject_id = ? AND status = 'pending'
         GROUP BY assigned_teacher_id
       ) loads ON loads.assigned_teacher_id = u.id
       WHERE ts.subject_id = ?
         AND u.role = 'teacher'
         AND u.status = 'active'
       ORDER BY pending_count ASC, u.id ASC`,
      [sid, sid]
    );
    return rows.map((row) => ({
      id: Number(row.id),
      status: row.status,
      pendingCount: Number(row.pending_count ?? 0),
    }));
  } catch (error) {
    if (error?.code === 'ER_BAD_FIELD_ERROR') {
      const [fallbackRows] = await connection.query(
        `SELECT u.id, u.status
         FROM teacher_subjects ts
         INNER JOIN users u ON u.id = ts.teacher_id
         WHERE ts.subject_id = ?
           AND u.role = 'teacher'
           AND u.status = 'active'
         ORDER BY u.id ASC`,
        [sid]
      );
      return fallbackRows.map((row) => ({
        id: Number(row.id),
        status: row.status,
        pendingCount: 0,
      }));
    }
    throw error;
  }
}

/**
 * @param {TeacherAssignmentAuditContext} auditContext
 * @param {Record<string, unknown>} metadata
 */
function logAssignmentAudit(auditContext, action, metadata) {
  void logActivity({
    userId: auditContext.studentId ?? null,
    role: auditContext.studentId ? 'student' : 'system',
    action,
    entityType: 'teacher_assignment',
    entityId: metadata.subjectId != null ? String(metadata.subjectId) : null,
    metadata: {
      ipAddress: auditContext.clientIp ?? null,
      requestId: auditContext.requestId ?? null,
      strategy: TEACHER_ASSIGNMENT_STRATEGY,
      ...metadata,
    },
  });
}

/**
 * Re-verify teacher is still operational and mapped inside the open transaction.
 * @param {Array<{ id: number, pendingCount: number }>} candidates
 * @param {number} subjectId
 * @param {import('mysql2/promise').PoolConnection} connection
 * @param {TeacherAssignmentAuditContext} auditContext
 */
async function pickOperationalTeacher(candidates, subjectId, connection, auditContext) {
  const skipped = [];

  for (const candidate of candidates) {
    const tid = Number(candidate.id);
    const [rows] = await connection.query(
      `SELECT id, status, role
       FROM users
       WHERE id = ? AND role = 'teacher'
       LIMIT 1
       FOR UPDATE`,
      [tid]
    );

    if (!rows[0]) {
      skipped.push({ teacherId: tid, reason: 'teacher_not_found' });
      continue;
    }
    if (!isTeacherOperationalStatus(rows[0].status)) {
      skipped.push({ teacherId: tid, reason: 'teacher_inactive', status: rows[0].status });
      continue;
    }

    const [mapping] = await connection.query(
      `SELECT 1 FROM teacher_subjects WHERE teacher_id = ? AND subject_id = ? LIMIT 1`,
      [tid, Number(subjectId)]
    );
    if (!mapping[0]) {
      skipped.push({ teacherId: tid, reason: 'subject_mapping_removed' });
      continue;
    }

    if (skipped.length) {
      logAssignmentAudit(auditContext, 'teacher.assignment.candidates_skipped', {
        subjectId: Number(subjectId),
        skipped,
        selectedTeacherId: tid,
        selectedPendingCount: candidate.pendingCount,
      });
    }

    return { teacherId: tid, pendingCount: candidate.pendingCount };
  }

  if (skipped.length) {
    logAssignmentAudit(auditContext, 'teacher.assignment.candidates_skipped', {
      subjectId: Number(subjectId),
      skipped,
      selectedTeacherId: null,
    });
  }

  return null;
}

function throwTeacherUnavailable({ subjectId, courseId, reason, auditContext = {} }) {
  logAssignmentAudit(auditContext, 'teacher.assignment.unavailable', {
    subjectId: subjectId ?? null,
    courseId: courseId ?? null,
    failureReason: reason,
  });

  throw new ApiError(422, TEACHER_UNAVAILABLE_PUBLIC_MESSAGE, { code: 'TEACHER_NOT_AVAILABLE' });
}

/**
 * Server-only teacher assignment for student questions.
 * Students never supply teacherId — routing is derived from teacher_subjects.
 *
 * @param {{
 *   subjectId: number,
 *   courseId: number,
 *   connection: import('mysql2/promise').PoolConnection,
 *   studentId?: number,
 *   auditContext?: TeacherAssignmentAuditContext,
 * }} input
 * @returns {Promise<TeacherAssignmentResult>}
 */
export async function assignTeacherForStudentQuestion({
  subjectId,
  courseId,
  connection,
  studentId = null,
  auditContext = {},
}) {
  const sid = Number(subjectId);
  const cid = Number(courseId);
  const ctx = { ...auditContext, studentId: studentId ?? auditContext.studentId ?? null };

  const subjectRow = await loadAssignableSubject(sid, cid, connection);

  const candidates = await listEligibleTeachersOrdered(subjectRow.id, connection);

  logAssignmentAudit(ctx, 'teacher.assignment.routing', {
    courseId: cid,
    subjectId: subjectRow.id,
    candidateCount: candidates.length,
    candidateOrder: candidates.map((c) => ({ teacherId: c.id, pendingCount: c.pendingCount })),
  });

  if (!candidates.length) {
    throwTeacherUnavailable({
      subjectId: subjectRow.id,
      courseId: cid,
      reason: 'no_operational_mapping',
      auditContext: ctx,
    });
  }

  const picked = await pickOperationalTeacher(candidates, subjectRow.id, connection, ctx);
  if (!picked) {
    throwTeacherUnavailable({
      subjectId: subjectRow.id,
      courseId: cid,
      reason: 'all_candidates_inactive_or_unmapped',
      auditContext: ctx,
    });
  }

  logAssignmentAudit(ctx, 'teacher.assignment.resolved', {
    courseId: cid,
    subjectId: subjectRow.id,
    assignedTeacherId: picked.teacherId,
    candidateCount: candidates.length,
    pendingCount: picked.pendingCount,
  });

  return {
    teacherId: picked.teacherId,
    subjectId: Number(subjectRow.id),
    subjectTitle: subjectRow.title,
    strategy: TEACHER_ASSIGNMENT_STRATEGY,
  };
}

/**
 * Assert a client-supplied teacher id is never accepted on student question routes.
 * @param {Record<string, unknown>} body
 */
export function rejectClientTeacherRouting(body) {
  if (!body || typeof body !== 'object') return;
  const forbidden = [
    'teacherId',
    'teacher_id',
    'assignedTeacherId',
    'assigned_teacher_id',
    'routing',
    'assignee',
    'preferredTeacher',
    'preferred_teacher',
  ];
  for (const key of forbidden) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      throw new ApiError(422, 'Invalid question payload', {
        code: 'TEACHER_ROUTING_FORBIDDEN',
        details: { field: key },
      });
    }
  }
}
