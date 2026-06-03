/**
 * CEE Scoped Query Bypass Policy
 *
 * Bypass is an audited exception for admin jobs, analytics, and migrations only.
 * Never available on student/public entitlement API paths.
 */

import { matchProtectionRule } from '../protectionGrid.js';
import { CeeBypassDeniedError, CeeInvalidBypassError } from '../../../errors/cee/ScopedQueryErrors.js';
import { CEE_AUDIT_ACTIONS, CEE_AUDIT_VIOLATION_TYPES } from '../audit/auditSchema.js';
import { emitSecurityAuditEvent } from '../audit/securityAuditLogger.js';

export const BYPASS_SCHEMA_VERSION = 'cee.bypass.policy.1';

export const CEE_BYPASS_CATEGORIES = Object.freeze(['admin_job', 'analytics', 'migration']);

export const MIN_BYPASS_REASON_LENGTH = 12;

/** Reason must be: `{category}:{descriptor}` — descriptor ≥ 8 chars after colon */
const BYPASS_REASON_PATTERN = /^(admin_job|analytics|migration):([a-z][a-z0-9_.-]{7,})$/i;

/**
 * Context prefix required per category (caller label at scopedQuery construction).
 * @type {Readonly<Record<string, RegExp>>}
 */
export const CEE_BYPASS_CONTEXT_BY_CATEGORY = Object.freeze({
  admin_job: /^admin\./,
  analytics: /^analytics\.|^admin\.reports\./,
  migration: /^migration\.|^job\./,
});

/** Context prefixes that must never use bypass — fail closed */
const DENIED_CONTEXT_PREFIXES = Object.freeze([
  /^studentportal\./i,
  /^student\./i,
  /^testattempt\./i,
  /^testentitlement\./i,
  /^public/i,
  /^entitlement\./i,
  /^securemedia\./i,
]);

/**
 * @typedef {'admin_job'|'analytics'|'migration'} CeeBypassCategory
 */

/**
 * @typedef {object} BypassValidationInput
 * @property {boolean} [allowUnscoped]
 * @property {string} [reason]
 * @property {string} [bypassReason]
 * @property {string} [context]
 * @property {string|null} [route]
 * @property {CeeBypassCategory} [bypassCategory]
 */

/**
 * @typedef {object} BypassValidationResult
 * @property {string} reason
 * @property {CeeBypassCategory} category
 * @property {string} context
 */

/**
 * Normalize reason from `reason` or `bypassReason` alias.
 * @param {BypassValidationInput} input
 */
export function normalizeBypassReason(input) {
  return String(input.bypassReason ?? input.reason ?? '').trim();
}

/**
 * @param {string} reason
 * @returns {CeeBypassCategory|null}
 */
export function parseBypassCategoryFromReason(reason) {
  const match = BYPASS_REASON_PATTERN.exec(String(reason || '').trim());
  if (!match) return null;
  const cat = match[1].toLowerCase();
  return CEE_BYPASS_CATEGORIES.includes(cat) ? /** @type {CeeBypassCategory} */ (cat) : null;
}

/**
 * @param {string|null|undefined} route — e.g. 'GET /api/student/dashboard'
 */
export function isBypassDeniedForHttpRoute(route) {
  const raw = String(route || '').trim();
  if (!raw) return false;

  const path = raw.replace(/^[A-Z]+\s+/i, '').split('?')[0];
  const rule = matchProtectionRule(path);
  if (!rule) return false;

  if (rule.policy === 'entitlement') return true;
  if (rule.label === 'courses_public_catalog' || rule.label === 'course_public_detail') return true;
  if (rule.label === 'course_batches_public') return true;
  return false;
}

/**
 * @param {string} context
 */
function isDeniedContext(context) {
  const ctx = String(context || '').trim();
  return DENIED_CONTEXT_PREFIXES.some((p) => p.test(ctx));
}

/**
 * Validate bypass request — throws CeeInvalidBypassError or CeeBypassDeniedError (fail-closed).
 * @param {BypassValidationInput} input
 * @returns {BypassValidationResult}
 */
export function validateBypassRequest(input) {
  if (input.allowUnscoped !== true) {
    throw new CeeInvalidBypassError({
      reason: 'bypass_not_requested',
      hint: 'Set allowUnscoped: true only for audited admin_job, analytics, or migration paths',
    });
  }

  const context = String(input.context || '').trim();
  if (!context) {
    throw new CeeInvalidBypassError({
      reason: 'context_required',
      hint: 'Bypass requires a stable context label (e.g. admin.tests.backfill)',
    });
  }

  if (isDeniedContext(context)) {
    emitSecurityAuditEvent({
      action: CEE_AUDIT_ACTIONS.BYPASS_DENIED,
      violationType: CEE_AUDIT_VIOLATION_TYPES.BYPASS_DENIED,
      outcome: 'denied',
      reason: 'context_prefix_forbidden',
      context,
      route: input.route ?? null,
    });
    throw new CeeBypassDeniedError({
      context,
      route: input.route ?? null,
      denialReason: 'context_prefix_forbidden',
      hint: 'Bypass is forbidden on student, entitlement, and public instructional contexts',
    });
  }

  if (isBypassDeniedForHttpRoute(input.route)) {
    emitSecurityAuditEvent({
      action: CEE_AUDIT_ACTIONS.BYPASS_DENIED,
      violationType: CEE_AUDIT_VIOLATION_TYPES.BYPASS_DENIED,
      outcome: 'denied',
      reason: 'http_route_forbidden',
      context,
      route: input.route ?? null,
    });
    throw new CeeBypassDeniedError({
      context,
      route: input.route,
      denialReason: 'http_route_forbidden',
      hint: 'Bypass cannot be used on student/public entitlement API routes — use course-scoped scopedQuery',
    });
  }

  const reason = normalizeBypassReason(input);
  if (reason.length < MIN_BYPASS_REASON_LENGTH) {
    throw new CeeInvalidBypassError({
      context,
      reasonLength: reason.length,
      minLength: MIN_BYPASS_REASON_LENGTH,
      hint: `Reason must be at least ${MIN_BYPASS_REASON_LENGTH} chars: "{category}:{descriptor}"`,
    });
  }

  const categoryFromReason = parseBypassCategoryFromReason(reason);
  if (!categoryFromReason) {
    throw new CeeInvalidBypassError({
      context,
      reason,
      hint: 'Reason format: admin_job:descriptor | analytics:descriptor | migration:descriptor (descriptor ≥ 8 chars)',
    });
  }

  if (input.bypassCategory && input.bypassCategory !== categoryFromReason) {
    throw new CeeInvalidBypassError({
      context,
      bypassCategory: input.bypassCategory,
      reasonCategory: categoryFromReason,
      hint: 'bypassCategory must match the category prefix in reason',
    });
  }

  const contextPattern = CEE_BYPASS_CONTEXT_BY_CATEGORY[categoryFromReason];
  if (!contextPattern || !contextPattern.test(context)) {
    throw new CeeBypassDeniedError({
      context,
      category: categoryFromReason,
      denialReason: 'context_category_mismatch',
      hint: `Context "${context}" must match prefix for ${categoryFromReason} (see CEE_BYPASS_CONTEXT_BY_CATEGORY)`,
    });
  }

  return { reason, category: categoryFromReason, context };
}

/**
 * @param {string|null|undefined} reason
 * @param {{ context?: string, route?: string|null }} [meta]
 */
export function assertValidBypassReason(reason, meta = {}) {
  return validateBypassRequest({
    allowUnscoped: true,
    bypassReason: reason,
    context: meta.context ?? 'unknown',
    route: meta.route ?? null,
  });
}
