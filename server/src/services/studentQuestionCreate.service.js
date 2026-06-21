import path from 'path';
import { mysqlPool } from '../config/mysql.js';
import { sanitizePlainText } from '../utils/plainTextSanitizer.js';
import { ApiError } from '../utils/apiError.js';
import { resolveActiveEntitlement, assertEntitlementGrantable } from './entitlement.service.js';
import { assignTeacherForStudentQuestion } from './teacherAssignment.service.js';
import { QA_AUDIT_CATEGORIES } from '../constants/qaAudit.schema.js';
import { writeQaAuditEvent } from './qaAuditLog.service.js';
import { buildTeacherQuestionThreadId } from './teacherQuestionThreadRef.js';
import { getClientIp } from '../utils/network.js';

import { deriveSubjectStorageSlug } from '../utils/subjectStorageSlug.js';
import {
  validateStudentQuestionWords,
} from '../utils/qaWordValidation.js';

const MAX_BODY_LENGTH = 2000;
const MAX_RECORDING_SECONDS = 120;

function sanitizeQuestionBody(raw) {
  return sanitizePlainText(String(raw ?? '').replace(/\u0000/g, ''));
}

function deriveTitle(body) {
  const oneLine = body.replace(/\s+/g, ' ').trim();
  if (oneLine.length <= 120) return oneLine;
  return `${oneLine.slice(0, 117)}…`;
}

function normalizeAttachmentUrl(raw, studentId, { requireRecordingPrefix = false } = {}) {
  if (raw === undefined || raw === null || String(raw).trim() === '') return null;
  const s = String(raw).trim();
  if (!s.startsWith('/api/uploads/student-qa/')) {
    throw new ApiError(400, 'Invalid attachment URL', { code: 'INVALID_ATTACHMENT_URL' });
  }
  if (s.includes('..')) {
    throw new ApiError(400, 'Invalid attachment URL', { code: 'INVALID_ATTACHMENT_URL' });
  }
  const base = path.posix.basename(s);
  if (!/^[a-zA-Z0-9._-]+$/.test(base)) {
    throw new ApiError(400, 'Invalid attachment URL', { code: 'INVALID_ATTACHMENT_URL' });
  }
  const expectedPrefix = `${Number(studentId)}-`;
  if (!base.startsWith(expectedPrefix)) {
    throw new ApiError(403, 'Attachment does not belong to your account', { code: 'ATTACHMENT_OWNERSHIP_DENIED' });
  }
  const isRecording = base.includes('-rec-');
  if (requireRecordingPrefix && !isRecording) {
    throw new ApiError(403, 'Invalid audio recording URL', { code: 'AUDIO_URL_FORBIDDEN' });
  }
  if (!requireRecordingPrefix && isRecording) {
    throw new ApiError(400, 'Invalid image attachment URL', { code: 'INVALID_ATTACHMENT_URL' });
  }
  return s;
}

async function assertStudentOperational(studentId) {
  const uid = Number(studentId);
  const [rows] = await mysqlPool.query(
    `SELECT id, role, status FROM users WHERE id = ? AND role = 'student' LIMIT 1`,
    [uid]
  );
  if (!rows[0]) {
    throw new ApiError(403, 'Student access required', { code: 'STUDENT_ROLE_REQUIRED' });
  }
  if (rows[0].status !== 'active') {
    throw new ApiError(403, 'Student account is not active', { code: 'STUDENT_INACTIVE' });
  }
  return rows[0];
}

function mapCreatedRow(row) {
  return {
    id: Number(row.id),
    userId: Number(row.user_id),
    courseId: row.course_id != null ? Number(row.course_id) : null,
    subjectId: row.subject_id != null ? Number(row.subject_id) : null,
    assignedTeacherId: row.assigned_teacher_id != null ? Number(row.assigned_teacher_id) : null,
    subject: row.subject,
    title: row.title,
    body: row.body,
    attachmentUrl: row.attachment_url ?? null,
    audioUrl: row.audio_url ?? null,
    answer: row.answer,
    status: row.status,
    answeredAt: row.answered_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function isMissingColumn(error, column) {
  return error?.code === 'ER_BAD_FIELD_ERROR' && String(error?.sqlMessage || '').includes(column);
}

/**
 * Production-grade student question creation.
 * Never trusts client-supplied courseId — derives from entitlement only.
 */
export async function createStudentQuestionSecure(
  studentId,
  { subjectId, body, imageUrl, audioUrl },
  { entitlement, req = null, authContext = {} } = {}
) {
  const uid = Number(studentId);
  if (!uid) {
    throw new ApiError(401, 'Authentication required', { code: 'AUTH_REQUIRED' });
  }

  await assertStudentOperational(uid);

  let entitled = entitlement;
  if (!entitled) {
    entitled = await resolveActiveEntitlement(uid);
    if (!entitled) {
      throw new ApiError(403, 'Active course enrollment required', { code: 'ENTITLEMENT_REQUIRED' });
    }
    assertEntitlementGrantable(entitled, { userId: uid, courseId: entitled.courseId });
  }

  const courseId = Number(entitled.courseId);
  if (!courseId) {
    throw new ApiError(403, 'Active course enrollment required', { code: 'ENTITLEMENT_REQUIRED' });
  }

  const sanitizedBody = sanitizeQuestionBody(body);
  const attachmentUrl = normalizeAttachmentUrl(imageUrl, uid, { requireRecordingPrefix: false });
  const audioAttachmentUrl = normalizeAttachmentUrl(audioUrl, uid, { requireRecordingPrefix: true });
  const hasMedia = Boolean(attachmentUrl || audioAttachmentUrl);

  if (!sanitizedBody && !hasMedia) {
    throw new ApiError(422, 'Message text cannot be empty', { code: 'EMPTY_QUESTION' });
  }
  if (sanitizedBody.length > MAX_BODY_LENGTH) {
    throw new ApiError(422, 'Question is too long', { code: 'QUESTION_TOO_LONG' });
  }

  const wordCheck = validateStudentQuestionWords(sanitizedBody, hasMedia);
  if (!wordCheck.ok) {
    throw new ApiError(422, wordCheck.message, { code: wordCheck.code });
  }

  const connection = await mysqlPool.getConnection();
  try {
    await connection.beginTransaction();

    const assignment = await assignTeacherForStudentQuestion({
      subjectId,
      courseId,
      connection,
      studentId: uid,
      auditContext: {
        clientIp: authContext.clientIp ?? getClientIp(req),
        requestId: req?.requestId ?? null,
      },
    });

    const legacySlug = deriveSubjectStorageSlug(assignment.subjectTitle, assignment.subjectId);

    const assignedTeacherId = assignment.teacherId;
    const subjectRowId = assignment.subjectId;

    const title = sanitizedBody ? deriveTitle(sanitizedBody) : hasMedia ? 'Media message' : deriveTitle(sanitizedBody);
    const teacherThreadRef = assignedTeacherId
      ? buildTeacherQuestionThreadId(assignedTeacherId, uid)
      : null;
    let insertResult;
    try {
      [insertResult] = await connection.query(
        `INSERT INTO student_questions (
           user_id, course_id, subject_id, assigned_teacher_id, teacher_thread_ref,
           subject, title, body, attachment_url, audio_url, status
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
        [
          uid,
          courseId,
          subjectRowId,
          assignedTeacherId,
          teacherThreadRef,
          legacySlug,
          title,
          sanitizedBody,
          attachmentUrl,
          audioAttachmentUrl,
        ]
      );
    } catch (error) {
      if (isMissingColumn(error, 'teacher_thread_ref')) {
        [insertResult] = await connection.query(
          `INSERT INTO student_questions (
             user_id, course_id, subject_id, assigned_teacher_id,
             subject, title, body, attachment_url, audio_url, status
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
          [
            uid,
            courseId,
            subjectRowId,
            assignedTeacherId,
            legacySlug,
            title,
            sanitizedBody,
            attachmentUrl,
            audioAttachmentUrl,
          ]
        );
      } else if (isMissingColumn(error, 'audio_url')) {
        [insertResult] = await connection.query(
          `INSERT INTO student_questions (
             user_id, course_id, subject_id, assigned_teacher_id,
             subject, title, body, attachment_url, status
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
          [uid, courseId, subjectRowId, assignedTeacherId, legacySlug, title, sanitizedBody, attachmentUrl]
        );
      } else if (isMissingColumn(error, 'course_id')) {
        [insertResult] = await connection.query(
          `INSERT INTO student_questions (user_id, subject, title, body, attachment_url) VALUES (?, ?, ?, ?, ?)`,
          [uid, legacySlug, title, sanitizedBody, attachmentUrl]
        );
      } else {
        throw error;
      }
    }

    const questionId = Number(insertResult.insertId);
    const [rows] = await connection.query(`SELECT * FROM student_questions WHERE id = ? LIMIT 1`, [questionId]);
    if (!rows[0]) {
      throw new ApiError(500, 'Question was not persisted', { code: 'CREATE_PERSISTENCE_FAILED' });
    }

    await connection.commit();

    const clientIp = authContext.clientIp ?? getClientIp(req);
    const userAgent = authContext.userAgent ?? req?.get?.('user-agent') ?? null;
    const requestId = req?.requestId ?? null;

    void writeQaAuditEvent({
      userId: uid,
      role: 'student',
      action: 'student.question.create',
      entityType: 'student_question',
      entityId: String(questionId),
      eventCategory: QA_AUDIT_CATEGORIES.QUESTION_CREATED,
      requestId,
      metadata: {
        courseId,
        subjectId: subjectRowId,
        assignedTeacherId,
        assignmentStrategy: assignment.strategy,
        hasAttachment: Boolean(attachmentUrl),
        hasAudio: Boolean(audioAttachmentUrl),
        maxRecordingSeconds: MAX_RECORDING_SECONDS,
        enrollmentId: entitled.enrollmentId ?? null,
        ipAddress: clientIp,
        userAgent,
      },
    });

    return mapCreatedRow(rows[0]);
  } catch (error) {
    await connection.rollback();
    if (error instanceof ApiError) {
      if (error.statusCode === 403 || error.statusCode === 422) {
        void writeQaAuditEvent({
          userId: uid,
          role: 'student',
          action: 'student.question.create.denied',
          entityType: 'student_question',
          eventCategory: QA_AUDIT_CATEGORIES.AUTHORIZATION_DENIED,
          requestId: req?.requestId ?? null,
          metadata: {
            errorCode: error.code ?? error.message,
            courseId,
            subjectId: Number(subjectId) || null,
            ipAddress: authContext.clientIp ?? getClientIp(req),
          },
        });
      }
      throw error;
    }
    if (error?.code === 'ER_NO_SUCH_TABLE') {
      throw new ApiError(503, 'Q&A storage is not initialized', { code: 'QA_STORAGE_UNAVAILABLE' });
    }
    throw error;
  } finally {
    connection.release();
  }
}
