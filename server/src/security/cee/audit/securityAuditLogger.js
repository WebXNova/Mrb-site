/**
 * CEE Security Audit Logger — unified structured sink for DB enforcement & entitlement events.
 *
 * - Single JSON line per event (SIEM-compatible)
 * - Optional async activity_logs persist (low overhead default: stdout only)
 * - Sanitized paths/metadata — no secrets, no bind params
 */

import { env } from '../../../config/env.js';
import { logActivity } from '../../../services/activityLog.service.js';
import { sanitizeMetadata, sanitizePath } from '../../../utils/logSanitizer.js';
import {
  CEE_AUDIT_SCHEMA_VERSION,
  CEE_SECURITY_AUDIT_TAG,
  severityForViolationType,
} from './auditSchema.js';

const MAX_SQL_SNIPPET = 240;
const MAX_REASON_LENGTH = 512;

export const CEE_SECURITY_AUDIT_ACTIVITY = 'cee.security.audit';

/**
 * @typedef {object} SecurityAuditInput
 * @property {string} action — CEE_AUDIT_ACTIONS value
 * @property {string} violationType
 * @property {string} [reason] — human/audit reason (bypass reason, error hint, denial cause)
 * @property {string} context
 * @property {string|null} [route]
 * @property {number|null} [userId]
 * @property {string|null} [requestId]
 * @property {number|null} [courseId]
 * @property {ReadonlyArray<string>} [tables]
 * @property {ReadonlyArray<string>} [registryKeys]
 * @property {string|null} [sqlSnippet]
 * @property {string|null} [errorCode]
 * @property {'denied'|'bypass'|'failure'|'allowed'} [outcome]
 * @property {string|null} [category] — bypass category (admin_job | analytics | migration)
 * @property {boolean} [skipStdout]
 * @property {boolean} [skipPersist]
 * @property {boolean} [devConsole]
 */

/**
 * @typedef {Readonly<{
 *   schemaVersion: string,
 *   tag: string,
 *   timestamp: string,
 *   action: string,
 *   violationType: string,
 *   outcome: string,
 *   severity: string,
 *   reason: string|null,
 *   route: string|null,
 *   userId: number|null,
 *   requestId: string|null,
 *   courseId: number|null,
 *   context: string,
 *   tables: ReadonlyArray<string>,
 *   registryKeys: ReadonlyArray<string>,
 *   sqlSnippet: string|null,
 *   errorCode: string|null,
 *   category: string|null,
 *   environment: string,
 * }>} CeeSecurityAuditRecord
 */

function isPersistEnabled() {
  if (String(process.env.CEE_SECURITY_AUDIT_PERSIST || '').toLowerCase() === 'true') return true;
  if (String(process.env.CEE_VIOLATION_PRODUCTION_AUDIT || '').toLowerCase() === 'true') return true;
  return env.nodeEnv !== 'production';
}

function isStdoutDisabled() {
  return String(process.env.CEE_SECURITY_AUDIT_STDOUT || '').toLowerCase() === 'false';
}

/**
 * @param {string|null|undefined} sql
 */
export function truncateSqlSnippet(sql) {
  const s = String(sql || '').replace(/\s+/g, ' ').trim();
  if (!s) return null;
  return s.length <= MAX_SQL_SNIPPET ? s : `${s.slice(0, MAX_SQL_SNIPPET)}…`;
}

/**
 * @param {number|null|undefined} userId
 */
function normalizeUserId(userId) {
  const n = Number(userId);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * @param {number|null|undefined} courseId
 */
function normalizeCourseId(courseId) {
  const n = Number(courseId);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * @param {string|null|undefined} reason
 */
function normalizeReason(reason) {
  if (reason == null || reason === '') return null;
  const r = String(reason).trim();
  return r.length <= MAX_REASON_LENGTH ? r : `${r.slice(0, MAX_REASON_LENGTH)}…`;
}

/**
 * @param {SecurityAuditInput} input
 * @returns {CeeSecurityAuditRecord}
 */
export function buildSecurityAuditRecord(input) {
  const violationType = String(input.violationType || 'UNKNOWN');
  const tables = Object.freeze([...(input.tables ?? [])]);

  return Object.freeze({
    schemaVersion: CEE_AUDIT_SCHEMA_VERSION,
    tag: CEE_SECURITY_AUDIT_TAG,
    timestamp: new Date().toISOString(),
    action: String(input.action),
    violationType,
    outcome: String(input.outcome ?? 'denied'),
    severity: severityForViolationType(violationType),
    reason: normalizeReason(input.reason),
    route: input.route ? sanitizePath(String(input.route)) : null,
    userId: normalizeUserId(input.userId),
    requestId: input.requestId ? String(input.requestId) : null,
    courseId: normalizeCourseId(input.courseId),
    context: String(input.context || 'unknown'),
    tables,
    registryKeys: Object.freeze([...(input.registryKeys ?? [])]),
    sqlSnippet: input.sqlSnippet != null ? truncateSqlSnippet(input.sqlSnippet) : null,
    errorCode: input.errorCode ? String(input.errorCode) : null,
    category: input.category ? String(input.category) : null,
    environment: env.nodeEnv,
  });
}

/**
 * @param {CeeSecurityAuditRecord} record
 */
export function formatSecurityAuditLine(record) {
  return JSON.stringify(record);
}

/**
 * @param {CeeSecurityAuditRecord} record
 */
function persistAuditRecord(record) {
  void logActivity({
    userId: record.userId,
    role: 'system',
    action: CEE_SECURITY_AUDIT_ACTIVITY,
    entityType: 'cee_security_audit',
    entityId: record.context,
    metadata: sanitizeMetadata({
      schemaVersion: record.schemaVersion,
      auditAction: record.action,
      violationType: record.violationType,
      outcome: record.outcome,
      severity: record.severity,
      reason: record.reason,
      route: record.route,
      requestId: record.requestId,
      courseId: record.courseId,
      tables: record.tables,
      registryKeys: record.registryKeys,
      sqlSnippet: record.sqlSnippet,
      errorCode: record.errorCode,
      category: record.category,
    }),
  });
}

/**
 * Emit a security audit event — primary integration point for all CEE subsystems.
 * @param {SecurityAuditInput} input
 * @returns {CeeSecurityAuditRecord}
 */
export function emitSecurityAuditEvent(input) {
  const record = buildSecurityAuditRecord(input);

  if (!input.skipStdout && !isStdoutDisabled()) {
    console.info(formatSecurityAuditLine(record));
  }

  if (!input.skipPersist && isPersistEnabled()) {
    persistAuditRecord(record);
  }

  if (input.devConsole && env.nodeEnv !== 'production') {
    console.warn(
      `[CEE.audit] ${record.action} type=${record.violationType} context=${record.context} ` +
        `tables=[${record.tables.join(',')}] reason=${record.reason ?? '(none)'}`
    );
  }

  return record;
}
