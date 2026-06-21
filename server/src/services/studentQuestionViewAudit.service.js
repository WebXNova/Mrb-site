import { QA_AUDIT_CATEGORIES } from '../constants/qaAudit.schema.js';
import { writeQaAuditEventFromReq } from './qaAuditLog.service.js';

/**
 * @param {import('express').Request} req
 * @param {{ count: number }} meta
 */
export async function logStudentQuestionListViewed(req, meta) {
  await writeQaAuditEventFromReq(req, {
    role: 'student',
    action: 'student.question.list.viewed',
    entityType: 'student_question',
    eventCategory: QA_AUDIT_CATEGORIES.QUESTION_VIEWED,
    metadata: { count: meta.count ?? 0, view: meta.view ?? null },
  });
}

/**
 * @param {import('express').Request} req
 * @param {{ questionId: number|string, status?: string, hasReply?: boolean }} meta
 */
export async function logStudentQuestionDetailViewed(req, meta) {
  await writeQaAuditEventFromReq(req, {
    role: 'student',
    action: 'student.question.detail.viewed',
    entityType: 'student_question',
    entityId: String(meta.questionId),
    eventCategory: QA_AUDIT_CATEGORIES.QUESTION_VIEWED,
    metadata: {
      status: meta.status ?? null,
      hasReply: Boolean(meta.hasReply),
    },
  });
}

/**
 * Uniform 404 — logs suspected IDOR / enumeration without revealing existence.
 * @param {import('express').Request} req
 * @param {{ questionId: number|string, reason?: string }} meta
 */
export async function logStudentQuestionViewDenied(req, meta) {
  await writeQaAuditEventFromReq(req, {
    role: 'student',
    action: 'student.question.view.denied',
    entityType: 'student_question',
    entityId: String(meta.questionId),
    eventCategory: QA_AUDIT_CATEGORIES.AUTHORIZATION_DENIED,
    metadata: {
      reason: meta.reason ?? 'not_found_or_not_owned',
      errorCode: 'QUESTION_NOT_FOUND',
    },
  });
}
