import { QA_AUDIT_CATEGORIES } from '../constants/qaAudit.schema.js';
import { writeQaAuditEventFromReq } from './qaAuditLog.service.js';

/**
 * @param {import('express').Request} req
 * @param {{ questionId: number|string, status?: string, statusUpdated?: boolean }} meta
 */
export async function logTeacherQuestionOpened(req, meta) {
  await writeQaAuditEventFromReq(req, {
    role: 'teacher',
    action: 'teacher.question.opened',
    entityType: 'student_question',
    entityId: String(meta.questionId),
    eventCategory: QA_AUDIT_CATEGORIES.QUESTION_VIEWED,
    metadata: {
      status: meta.status ?? null,
      statusUpdated: Boolean(meta.statusUpdated),
    },
  });
}

/**
 * @param {import('express').Request} req
 * @param {{ questionId: number|string, reason?: string }} meta
 */
export async function logTeacherQuestionAccessDenied(req, meta) {
  await writeQaAuditEventFromReq(req, {
    role: 'teacher',
    action: 'teacher.question.access.denied',
    entityType: 'student_question',
    entityId: String(meta.questionId),
    eventCategory: QA_AUDIT_CATEGORIES.AUTHORIZATION_DENIED,
    metadata: {
      reason: meta.reason ?? 'not_assigned_or_missing',
      errorCode: 'QUESTION_ACCESS_DENIED',
    },
  });
}

/**
 * @param {import('express').Request} req
 * @param {{ count: number, status?: string, search?: string }} meta
 */
export async function logTeacherQuestionInboxViewed(req, meta) {
  await writeQaAuditEventFromReq(req, {
    role: 'teacher',
    action: 'teacher.question.inbox.viewed',
    entityType: 'student_question',
    eventCategory: QA_AUDIT_CATEGORIES.QUESTION_VIEWED,
    metadata: {
      count: meta.count ?? 0,
      status: meta.status ?? 'all',
      search: meta.search ? '[redacted]' : null,
    },
  });
}

/**
 * @param {import('express').Request} req
 * @param {{ questionId: number|string, pinned: boolean }} meta
 */
export async function logTeacherQuestionPinned(req, meta) {
  await writeQaAuditEventFromReq(req, {
    role: 'teacher',
    action: meta.pinned ? 'teacher.question.pinned' : 'teacher.question.unpinned',
    entityType: 'student_question',
    entityId: String(meta.questionId),
    eventCategory: QA_AUDIT_CATEGORIES.QUESTION_VIEWED,
    metadata: { pinned: Boolean(meta.pinned) },
  });
}

/**
 * @param {import('express').Request} req
 * @param {{ questionId: number|string, reason: string, code?: string }} meta
 */
export async function logTeacherQuestionAnswerRejected(req, meta) {
  await writeQaAuditEventFromReq(req, {
    role: 'teacher',
    action: 'teacher.question.answer.rejected',
    entityType: 'student_question',
    entityId: String(meta.questionId),
    eventCategory: QA_AUDIT_CATEGORIES.UPLOAD_REJECTED,
    metadata: {
      reason: meta.reason,
      errorCode: meta.code ?? null,
    },
  });
}

/**
 * @param {import('express').Request} req
 * @param {{ questionId: number|string, hasImage?: boolean, hasAudio?: boolean, bodyLength?: number }} meta
 */
export async function logTeacherQuestionAnswerCreated(req, meta) {
  await writeQaAuditEventFromReq(req, {
    role: 'teacher',
    action: 'teacher.question.answer.created',
    entityType: 'student_question',
    entityId: String(meta.questionId),
    eventCategory: QA_AUDIT_CATEGORIES.QUESTION_ANSWERED,
    metadata: {
      hasImage: Boolean(meta.hasImage),
      hasAudio: Boolean(meta.hasAudio),
      bodyLength: meta.bodyLength ?? null,
    },
  });
}

/**
 * @param {import('express').Request} req
 * @param {{ questionId: number|string }} meta
 */
export async function logTeacherQuestionSeenUpdated(req, meta) {
  await writeQaAuditEventFromReq(req, {
    role: 'teacher',
    action: 'teacher.question.seen.updated',
    entityType: 'student_question',
    entityId: String(meta.questionId),
    eventCategory: QA_AUDIT_CATEGORIES.QUESTION_VIEWED,
    metadata: {},
  });
}
