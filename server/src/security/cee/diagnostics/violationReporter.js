/**
 * CEE Security Violation Reporter
 *
 * Developer diagnostics (dev banners) + unified security audit logging.
 * Integrates with scopedQueryGuard — violations are NEVER silent.
 */

import { env } from '../../../config/env.js';
import { CEE_AUDIT_ACTIONS, CEE_AUDIT_VIOLATION_TYPES } from '../audit/auditSchema.js';
import { emitSecurityAuditEvent } from '../audit/securityAuditLogger.js';
import { CEE_VIOLATION_TYPES, VIOLATION_SCHEMA_VERSION } from './violationTypes.js';

const MAX_STACK_FRAMES = 14;
const DEV_BANNER_WIDTH = 56;

export { CEE_VIOLATION_TYPES, VIOLATION_SCHEMA_VERSION };
export const CEE_VIOLATION_SIEM_TAG = 'cee.security.audit';
export const CEE_VIOLATION_ACTIVITY_ACTION = 'cee.security.audit';

/**
 * @typedef {keyof typeof CEE_VIOLATION_TYPES} CeeViolationType
 */

/**
 * @typedef {object} CeeViolationReportInput
 * @property {CeeViolationType} violationType
 * @property {string} context
 * @property {string} [route]
 * @property {number|null} [userId]
 * @property {string|null} [requestId]
 * @property {number|null} [courseId]
 * @property {ReadonlyArray<string>} [protectedTables]
 * @property {ReadonlyArray<string>} [registryKeys]
 * @property {string} [sql]
 * @property {string} [hint]
 * @property {string} [errorCode]
 * @property {boolean} [skipAudit]
 * @property {boolean} [skipConsole]
 */

const STACK_NOISE = /violationReporter\.js|securityAuditLogger|emitSecurityAuditEvent|reportScopeViolation/i;

function isDevDiagnosticsEnabled() {
  return env.nodeEnv !== 'production' || String(process.env.CEE_VIOLATION_DEV_ALWAYS || '').toLowerCase() === 'true';
}

function captureDiagnosticStack() {
  if (!isDevDiagnosticsEnabled()) return null;
  const raw = new Error('CEE_VIOLATION_STACK_CAPTURE');
  const lines = String(raw.stack || '')
    .split('\n')
    .slice(2)
    .map((line) => line.trim())
    .filter((line) => line && !STACK_NOISE.test(line))
    .slice(0, MAX_STACK_FRAMES);
  return lines.length ? lines.join('\n') : null;
}

/**
 * Map legacy violation type → audit action.
 * @param {string} violationType
 */
function actionForViolationType(violationType) {
  if (violationType === CEE_VIOLATION_TYPES.MISSING_COURSE_SCOPE) {
    return CEE_AUDIT_ACTIONS.MISSING_COURSE_SCOPE;
  }
  return CEE_AUDIT_ACTIONS.UNSCOPED_QUERY_ATTEMPT;
}

/**
 * @param {CeeViolationReportInput & { diagnosticStack?: string|null }} input
 */
function auditScopeViolation(input) {
  const violationType = String(input.violationType);
  const tables = [...(input.protectedTables ?? [])];

  emitSecurityAuditEvent({
    action: actionForViolationType(violationType),
    violationType,
    outcome: 'denied',
    reason: input.hint ?? input.errorCode ?? violationType,
    context: input.context,
    route: input.route ?? null,
    userId: input.userId ?? null,
    requestId: input.requestId ?? null,
    courseId: input.courseId ?? null,
    tables,
    registryKeys: input.registryKeys ?? [],
    sqlSnippet: input.sql ?? null,
    errorCode: input.errorCode ?? null,
    skipPersist: input.skipAudit,
    skipStdout: input.skipAudit,
  });
}

/**
 * @param {CeeViolationReportInput & { diagnosticStack?: string|null }} input
 */
function formatDevBanner(input) {
  const line = '═'.repeat(DEV_BANNER_WIDTH);
  const tables = input.protectedTables ?? [];
  const rows = [
    line,
    ` CEE SECURITY VIOLATION: ${input.violationType}`,
    line,
    ` context:   ${input.context}`,
    ` route:     ${input.route ?? '(not provided)'}`,
    ` userId:    ${input.userId ?? '(none)'}`,
    ` courseId:  ${input.courseId ?? '(missing)'}`,
    ` tables:    ${tables.length ? tables.join(', ') : '(none)'}`,
    ` hint:      ${input.hint ?? '(see CEE docs)'}`,
    ` code:      ${input.errorCode ?? '(n/a)'}`,
  ];
  if (input.diagnosticStack) {
    rows.push(' stack:');
    for (const frame of input.diagnosticStack.split('\n')) {
      rows.push(`   ${frame}`);
    }
  }
  rows.push(line);
  return rows.join('\n');
}

/** @deprecated Use formatSecurityAuditLine from audit/securityAuditLogger */
export function formatSiemPayload(record) {
  return JSON.stringify({ tag: CEE_VIOLATION_SIEM_TAG, ...record });
}

/** @deprecated Use buildSecurityAuditRecord */
export function buildViolationRecord(input) {
  auditScopeViolation(input);
  return {
    violationType: input.violationType,
    context: input.context,
    protectedTables: input.protectedTables ?? [],
  };
}

/**
 * Report a scope violation — call BEFORE throwing AppError (fail-closed, never silent).
 * @param {CeeViolationReportInput} input
 */
export function reportScopeViolation(input) {
  const diagnosticStack = captureDiagnosticStack();

  if (!input.skipAudit) {
    auditScopeViolation({ ...input, diagnosticStack });
  }

  if (isDevDiagnosticsEnabled() && !input.skipConsole) {
    console.error(formatDevBanner({ ...input, diagnosticStack }));
  }
}

/**
 * @param {Omit<CeeViolationReportInput, 'violationType'>} input
 */
export function reportMissingCourseScopeViolation(input) {
  return reportScopeViolation({
    ...input,
    violationType: CEE_AUDIT_VIOLATION_TYPES.MISSING_COURSE_SCOPE,
    errorCode: input.errorCode ?? 'CEE_MISSING_COURSE_SCOPE',
    hint:
      input.hint ??
      'Provide a valid entitled courseId to scopedQuery() / validateScopedQuery() before accessing protected tables',
  });
}

/**
 * @param {Omit<CeeViolationReportInput, 'violationType'>} input
 */
export function reportUnscopedProtectedQueryViolation(input) {
  return reportScopeViolation({
    ...input,
    violationType: CEE_AUDIT_VIOLATION_TYPES.UNSCOPED_PROTECTED_QUERY,
    errorCode: input.errorCode ?? 'CEE_UNSCOPED_QUERY_DENIED',
    hint:
      input.hint ??
      'Protected instructional SQL must include course_id = ? (or registry join path) — global reads are forbidden',
  });
}
