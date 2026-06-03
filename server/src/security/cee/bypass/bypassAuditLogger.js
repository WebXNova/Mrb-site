/**
 * Bypass audit — delegates to unified CEE security audit logger.
 */

import { CEE_AUDIT_ACTIONS, CEE_AUDIT_VIOLATION_TYPES } from '../audit/auditSchema.js';
import { emitSecurityAuditEvent } from '../audit/securityAuditLogger.js';

export const CEE_BYPASS_SIEM_TAG = 'cee.security.audit';
export const CEE_BYPASS_ACTIVITY_ACTION = 'cee.security.audit';

/**
 * @typedef {object} BypassAuditPayload
 * @property {string} context
 * @property {string} reason
 * @property {string} category
 * @property {ReadonlyArray<string>} touchedTables
 * @property {ReadonlyArray<string>} registryKeys
 * @property {string|null} [sqlSnippet]
 * @property {number|null} [userId]
 * @property {string|null} [requestId]
 * @property {string|null} [route]
 * @property {number|null} [courseId]
 * @property {boolean} [skipPersist]
 */

/**
 * @param {BypassAuditPayload} payload
 */
export function buildBypassAuditRecord(payload) {
  return emitSecurityAuditEvent({
    action: CEE_AUDIT_ACTIONS.SCOPE_BYPASS,
    violationType: CEE_AUDIT_VIOLATION_TYPES.SCOPE_BYPASS,
    outcome: 'bypass',
    reason: payload.reason,
    context: payload.context,
    route: payload.route ?? null,
    userId: payload.userId ?? null,
    requestId: payload.requestId ?? null,
    courseId: payload.courseId ?? null,
    tables: payload.touchedTables ?? [],
    registryKeys: payload.registryKeys ?? [],
    sqlSnippet: payload.sqlSnippet ?? null,
    category: payload.category,
    skipPersist: payload.skipPersist,
    devConsole: true,
    skipStdout: false,
  });
}

/**
 * @param {ReturnType<typeof emitSecurityAuditEvent>} record
 */
export function formatBypassSiemLine(record) {
  return JSON.stringify(record);
}

/**
 * @param {BypassAuditPayload} payload
 */
export function logBypassEvent(payload) {
  return buildBypassAuditRecord(payload);
}
