/**
 * CEE Protection Grid — strict FAIL-CLOSED route-level entitlement enforcement.
 *
 * Protected namespaces (see protectedNamespaceRegistry.js) MUST have explicit grid rules.
 * Unregistered paths under those namespaces are denied — never silently passed through.
 */

import { entitlementGuard, identityOnlyGuard } from './entitlementGuard.js';
import { questionBankMediaGuard } from './questionBankMediaGuard.js';
import { studentQaMediaGuard } from './studentQaMediaGuard.js';
import { catalogMediaGuard } from './secureMediaGrid.js';
import {
  getAdminSecretPathSegments,
} from '../../config/adminSecretPath.config.js';
import {
  CeeUnknownProtectedRouteError,
  CeeProtectionGridDeniedError,
} from '../../errors/cee/ProtectionGridErrors.js';
import { matchProtectedNamespace } from './protectedNamespaceRegistry.js';
import { logProtectionGridViolation } from './protectionGridDiagnostics.js';

/** @typedef {'entitlement' | 'identity_only' | 'public' | 'admin_delegated' | 'question_bank_media' | 'student_qa_media' | 'course_covers_public'} GridPolicy */

/**
 * @typedef {object} GridRule
 * @property {RegExp} pattern
 * @property {GridPolicy} policy
 * @property {string} label
 */

/**
 * Escape a path segment for safe use inside RegExp.
 * @param {string} segment
 */
function escapeRegExpSegment(segment) {
  return String(segment).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * @param {string} suffix — e.g. `/enrollments(?:/|$)`
 */
function buildAdminSubpathPatterns(suffix) {
  return getAdminSecretPathSegments().map(
    (segment) => new RegExp(`^/api/admin/${escapeRegExpSegment(segment)}${suffix}`, 'i')
  );
}

/**
 * PROTECTED ROUTES GRID — order matters (first match wins).
 * Admin mount patterns are derived from ADMIN_SECRET_PATH at startup.
 * @returns {GridRule[]}
 */
function buildProtectionGridRules() {
  const adminMountPatterns = getAdminSecretPathSegments().map(
    (segment) => new RegExp(`^/api/admin/${escapeRegExpSegment(segment)}(?:/|$)`, 'i')
  );
  const adminEnrollmentPatterns = buildAdminSubpathPatterns('/enrollments(?:/|$)');
  const adminQuestionsPatterns = buildAdminSubpathPatterns('/questions(?:/|$)');
  const adminQuizDraftPatterns = buildAdminSubpathPatterns('/tests/[^/]+/quiz-draft$');

  /** @type {GridRule[]} */
  const rules = [
    { pattern: /^\/api\/health$/i, policy: 'public', label: 'health' },
    { pattern: /^\/api\/ready$/i, policy: 'public', label: 'ready' },
    { pattern: /^\/api\/metrics$/i, policy: 'admin_delegated', label: 'metrics' },
    { pattern: /^\/api\/payments\/webhook/i, policy: 'public', label: 'payments_webhook' },
    { pattern: /^\/api\/email\//i, policy: 'public', label: 'email_webhooks' },
    { pattern: /^\/api\/contact\//i, policy: 'public', label: 'contact' },
    { pattern: /^\/api\/locations\//i, policy: 'public', label: 'locations' },
    { pattern: /^\/api\/auth\//i, policy: 'public', label: 'auth' },
    { pattern: /^\/api\/courses\/public/i, policy: 'public', label: 'courses_public_catalog' },
    { pattern: /^\/api\/courses\/\d+\/batches$/i, policy: 'public', label: 'course_batches_public' },
    { pattern: /^\/api\/courses\/\d+\/subjects$/i, policy: 'public', label: 'course_subjects_public' },
    { pattern: /^\/api\/courses\/\d+$/i, policy: 'public', label: 'course_public_detail' },
  ];

  for (const pattern of adminMountPatterns) {
    rules.push({ pattern, policy: 'public', label: 'admin_secret_mount' });
  }
  for (const pattern of adminEnrollmentPatterns) {
    rules.push({ pattern, policy: 'admin_delegated', label: 'enrollments_admin' });
  }
  for (const pattern of adminQuestionsPatterns) {
    rules.push({ pattern, policy: 'admin_delegated', label: 'questions_admin' });
  }
  for (const pattern of adminQuizDraftPatterns) {
    rules.push({ pattern, policy: 'admin_delegated', label: 'tests_quiz_draft_admin' });
  }

  rules.push(
    { pattern: /^\/api\/enrollments(?:\/|$)/i, policy: 'identity_only', label: 'enrollments' },
    { pattern: /^\/api\/payments\/create-session$/i, policy: 'identity_only', label: 'payments_create_session' },
    { pattern: /^\/api\/uploads\/courses\//i, policy: 'course_covers_public', label: 'uploads_courses' },
    { pattern: /^\/api\/uploads\/course-covers\//i, policy: 'course_covers_public', label: 'uploads_course_covers' },
    { pattern: /^\/api\/uploads\/question-bank\//i, policy: 'question_bank_media', label: 'uploads_question_bank' },
    { pattern: /^\/api\/uploads\/student-qa\//i, policy: 'student_qa_media', label: 'uploads_student_qa' },
    { pattern: /^\/api\/uploads\/teacher-qa\//i, policy: 'student_qa_media', label: 'uploads_teacher_qa' },
    { pattern: /^\/api\/student\/enrollment-status$/i, policy: 'identity_only', label: 'student_enrollment_status' },
    { pattern: /^\/api\/student(?:\/|$)/i, policy: 'entitlement', label: 'student_portal' },
    { pattern: /^\/api\/tests(?:\/|$)/i, policy: 'entitlement', label: 'tests' },
    { pattern: /^\/api\/attempt(?:\/|$)/i, policy: 'entitlement', label: 'legacy_attempt_runtime' },
    { pattern: /^\/api\/attempts(?:\/|$)/i, policy: 'entitlement', label: 'legacy_attempts_runtime' },
    { pattern: /^\/api\/lectures(?:\/|$)/i, policy: 'entitlement', label: 'lectures' },
    { pattern: /^\/api\/uploads(?:\/|$)/i, policy: 'entitlement', label: 'uploads' },
    { pattern: /^\/api\/results(?:\/|$)/i, policy: 'entitlement', label: 'results' }
  );

  return rules;
}

/** @type {GridRule[] | null} */
let cachedProtectionGridRules = null;

export function getProtectionGridRules() {
  if (!cachedProtectionGridRules) {
    cachedProtectionGridRules = buildProtectionGridRules();
  }
  return cachedProtectionGridRules;
}

/** @deprecated Use getProtectionGridRules() — kept for startup validator imports. */
export const PROTECTION_GRID_RULES = getProtectionGridRules();

/**
 * Route mapping table for audits (human-readable).
 */
export const ROUTE_PROTECTION_TABLE = getProtectionGridRules().map((r) => ({
  pattern: r.pattern.source,
  policy: r.policy,
  label: r.label,
  middleware:
    r.policy === 'entitlement'
      ? 'identityGuard + entitlementGuard'
      : r.policy === 'identity_only'
        ? 'identityGuard'
        : r.policy === 'question_bank_media'
          ? 'questionBankMediaGuard'
          : r.policy === 'student_qa_media'
            ? 'studentQaMediaGuard'
            : r.policy === 'course_covers_public'
            ? 'catalogMediaGuard (signed URL or entitled token)'
            : r.policy === 'admin_delegated'
              ? 'adminSecurityStack (route)'
              : 'none',
}));

/**
 * @param {string} path — req.path or originalUrl pathname
 * @returns {GridRule|null}
 */
export function matchProtectionRule(path) {
  const normalized = String(path || '').split('?')[0];
  for (const rule of getProtectionGridRules()) {
    if (rule.pattern.test(normalized)) {
      return rule;
    }
  }
  return null;
}

export { extractRequestedCourseId } from './courseIdExtractor.js';

/**
 * @param {GridRule|null} rule
 */
function middlewareStackForRule(rule) {
  if (!rule) return 'none (unregistered)';
  return (
    ROUTE_PROTECTION_TABLE.find((row) => row.label === rule.label)?.middleware ??
    (rule.policy === 'entitlement'
      ? 'identityGuard + entitlementGuard'
      : rule.policy === 'identity_only'
        ? 'identityGuard'
        : rule.policy === 'question_bank_media'
          ? 'questionBankMediaGuard'
          : rule.policy === 'student_qa_media'
            ? 'studentQaMediaGuard'
            : rule.policy === 'admin_delegated'
            ? 'adminSecurityStack (route)'
            : 'none')
  );
}

/**
 * Global CEE middleware — apply protection grid before route handlers.
 * FAIL-CLOSED: protected namespaces without a non-public grid rule are denied.
 */
export function ceeProtectionGridMiddleware() {
  return async function ceeProtectionGrid(req, res, next) {
    const path = req.path || req.originalUrl?.split('?')[0] || '';
    const namespace = matchProtectedNamespace(path);
    const rule = matchProtectionRule(path);

    if (namespace && (!rule || rule.policy === 'public')) {
      const policyStatus = rule?.policy ?? 'unregistered';
      logProtectionGridViolation({
        reason: 'unknown_protected_route',
        method: req.method,
        path,
        namespace: namespace.namespace,
        policyStatus,
        gridLabel: rule?.label ?? null,
        userId: req.user?.id ?? req.auth?.userId ?? null,
        requestId: req.requestId ?? null,
      });

      return next(
        new CeeUnknownProtectedRouteError({
          path,
          namespace: namespace.namespace,
          policyStatus,
          middlewareStack: middlewareStackForRule(rule),
          timestamp: new Date().toISOString(),
        })
      );
    }

    if (!rule) {
      return next();
    }

    if (rule.policy === 'public') {
      return next();
    }

    if (rule.policy === 'identity_only') {
      return identityOnlyGuard(req, res, next);
    }

    if (rule.policy === 'question_bank_media') {
      return questionBankMediaGuard(req, res, next);
    }

    if (rule.policy === 'student_qa_media') {
      return studentQaMediaGuard(req, res, next);
    }

    if (rule.policy === 'admin_delegated') {
      return next();
    }

    if (rule.policy === 'course_covers_public') {
      return catalogMediaGuard(req, res, next);
    }

    if (rule.policy === 'entitlement') {
      return entitlementGuard(req, res, next);
    }

    logProtectionGridViolation({
      reason: 'unknown_grid_policy',
      method: req.method,
      path,
      namespace: namespace?.namespace ?? null,
      policyStatus: rule.policy,
      gridLabel: rule.label,
      userId: req.user?.id ?? req.auth?.userId ?? null,
      requestId: req.requestId ?? null,
    });

    return next(
      new CeeProtectionGridDeniedError({
        path,
        policy: rule.policy,
        label: rule.label,
        timestamp: new Date().toISOString(),
      })
    );
  };
}

/**
 * @param {import('express').Express} app
 */
export function applyCeeProtectionGrid(app) {
  app.use(ceeProtectionGridMiddleware());
}
