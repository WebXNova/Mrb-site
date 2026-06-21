/**
 * Canonical Q&A audit event taxonomy.
 * Maps operational actions to observability categories for dashboards and alerts.
 */

export const QA_AUDIT_SCHEMA_VERSION = '1.0';

/** High-level categories required for compliance dashboards. */
export const QA_AUDIT_CATEGORIES = Object.freeze({
  QUESTION_CREATED: 'question_created',
  QUESTION_VIEWED: 'question_viewed',
  QUESTION_ANSWERED: 'question_answered',
  UPLOAD_ACCEPTED: 'upload_accepted',
  UPLOAD_REJECTED: 'upload_rejected',
  AUTHORIZATION_DENIED: 'authorization_denied',
  SUSPICIOUS_ACTIVITY: 'suspicious_activity',
});

/**
 * Infer audit category from action string when callers omit explicit category.
 * @param {string} action
 */
export function inferQaAuditCategory(action) {
  const a = String(action || '').toLowerCase();

  if (a.includes('.upload.success') || a.endsWith('.success')) {
    return QA_AUDIT_CATEGORIES.UPLOAD_ACCEPTED;
  }
  if (
    a.includes('.upload.validation_failed') ||
    a.includes('.upload.mime_mismatch') ||
    a.includes('.upload.failed') ||
    a.includes('.answer.rejected')
  ) {
    return QA_AUDIT_CATEGORIES.UPLOAD_REJECTED;
  }
  if (a.includes('.answer.created')) {
    return QA_AUDIT_CATEGORIES.QUESTION_ANSWERED;
  }
  if (a.includes('.create') && !a.includes('.denied') && !a.includes('.rate_limit')) {
    return QA_AUDIT_CATEGORIES.QUESTION_CREATED;
  }
  if (
    a.includes('.viewed') ||
    a.includes('.opened') ||
    a.includes('.inbox.viewed') ||
    a.includes('.seen.updated')
  ) {
    return QA_AUDIT_CATEGORIES.QUESTION_VIEWED;
  }
  if (
    a.includes('.denied') ||
    a.includes('.access.denied') ||
    a.includes('.view.denied') ||
    a.includes('.create.denied')
  ) {
    return QA_AUDIT_CATEGORIES.AUTHORIZATION_DENIED;
  }
  if (
    a.includes('.security.') ||
    a.includes('.rate_limit') ||
    a.includes('.suspicious') ||
    a.includes('.cleanup.')
  ) {
    return QA_AUDIT_CATEGORIES.SUSPICIOUS_ACTIVITY;
  }

  return QA_AUDIT_CATEGORIES.SUSPICIOUS_ACTIVITY;
}
