import { QA_AUDIT_CATEGORIES } from '../constants/qaAudit.schema.js';
import { emitSecurityAuditEvent } from '../security/cee/audit/securityAuditLogger.js';
import { CEE_AUDIT_ACTIONS, CEE_AUDIT_VIOLATION_TYPES } from '../security/cee/audit/auditSchema.js';
import { writeQaAuditEventFromReq } from './qaAuditLog.service.js';

/**
 * Structured security audit for student question submission flows.
 * Dual-sinks: hardened activity_logs + CEE security audit stream.
 */
export async function logStudentQuestionSecurityEvent(req, {
  action,
  code,
  reason,
  metadata = {},
}) {
  const route = req.originalUrl || req.path;
  const requestId = req.requestId ?? null;
  const userId = req.user?.id ?? null;

  const eventCategory = String(action || '').includes('.security.')
    ? QA_AUDIT_CATEGORIES.SUSPICIOUS_ACTIVITY
    : QA_AUDIT_CATEGORIES.AUTHORIZATION_DENIED;

  await writeQaAuditEventFromReq(req, {
    role: 'student',
    action,
    entityType: 'student_question',
    eventCategory,
    metadata: {
      errorCode: code,
      reason: reason ?? code,
      ...metadata,
    },
  });

  try {
    emitSecurityAuditEvent({
      action: CEE_AUDIT_ACTIONS.ENTITLEMENT_DENIED,
      violationType: CEE_AUDIT_VIOLATION_TYPES.BYPASS_DENIED,
      reason: reason ?? code,
      context: 'student_question_submission',
      route,
      userId,
      requestId,
      outcome: 'denied',
      devConsole: true,
    });
  } catch (error) {
    await writeQaAuditEventFromReq(req, {
      role: 'student',
      action: 'student.question.security.cee_emit_failed',
      entityType: 'student_question',
      eventCategory: QA_AUDIT_CATEGORIES.SUSPICIOUS_ACTIVITY,
      metadata: {
        originalAction: action,
        errorCode: code,
        ceeError: error instanceof Error ? error.message : String(error),
      },
    });
  }
}
