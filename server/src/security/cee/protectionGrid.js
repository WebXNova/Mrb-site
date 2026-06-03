/**
 * CEE Protection Grid — strict FAIL-CLOSED route-level entitlement enforcement.
 *
 * Protected namespaces (see protectedNamespaceRegistry.js) MUST have explicit grid rules.
 * Unregistered paths under those namespaces are denied — never silently passed through.
 */

import { entitlementGuard, identityOnlyGuard } from './entitlementGuard.js';
import {
  CeeUnknownProtectedRouteError,
  CeeProtectionGridDeniedError,
} from '../../errors/cee/ProtectionGridErrors.js';
import { matchProtectedNamespace } from './protectedNamespaceRegistry.js';
import { logProtectionGridViolation } from './protectionGridDiagnostics.js';

/** @typedef {'entitlement' | 'identity_only' | 'public'} GridPolicy */

/**
 * @typedef {object} GridRule
 * @property {RegExp} pattern
 * @property {GridPolicy} policy
 * @property {string} label
 */

/**
 * PROTECTED ROUTES GRID — order matters (first match wins).
 * @type {GridRule[]}
 */
export const PROTECTION_GRID_RULES = [
  // --- Public / infrastructure (no CEE) ---
  { pattern: /^\/api\/health$/i, policy: 'public', label: 'health' },
  { pattern: /^\/api\/ready$/i, policy: 'public', label: 'ready' },
  { pattern: /^\/api\/payments\/webhook/i, policy: 'public', label: 'payments_webhook' },
  { pattern: /^\/api\/email\//i, policy: 'public', label: 'email_webhooks' },
  { pattern: /^\/api\/contact\//i, policy: 'public', label: 'contact' },
  { pattern: /^\/api\/locations\//i, policy: 'public', label: 'locations' },
  { pattern: /^\/api\/auth\//i, policy: 'public', label: 'auth' },
  { pattern: /^\/api\/admin\//i, policy: 'public', label: 'admin' },
  { pattern: /^\/api\/courses\/public/i, policy: 'public', label: 'courses_public_catalog' },
  { pattern: /^\/api\/courses\/\d+\/batches$/i, policy: 'public', label: 'course_batches_public' },
  { pattern: /^\/api\/courses\/\d+$/i, policy: 'public', label: 'course_public_detail' },

  // --- Identity only (pre-entitlement flows) ---
  { pattern: /^\/api\/enrollments(?:\/|$)/i, policy: 'identity_only', label: 'enrollments' },
  { pattern: /^\/api\/payments\/create-session$/i, policy: 'identity_only', label: 'payments_create_session' },

  // --- ENTITLEMENT REQUIRED (fail-closed instructional / premium) ---
  { pattern: /^\/api\/student(?:\/|$)/i, policy: 'entitlement', label: 'student_portal' },
  { pattern: /^\/api\/tests(?:\/|$)/i, policy: 'entitlement', label: 'tests' },
  { pattern: /^\/api\/lectures(?:\/|$)/i, policy: 'entitlement', label: 'lectures' },
  { pattern: /^\/api\/uploads(?:\/|$)/i, policy: 'entitlement', label: 'uploads' },
  { pattern: /^\/api\/results(?:\/|$)/i, policy: 'entitlement', label: 'results' },
];

/**
 * Route mapping table for audits (human-readable).
 */
export const ROUTE_PROTECTION_TABLE = PROTECTION_GRID_RULES.map((r) => ({
  pattern: r.pattern.source,
  policy: r.policy,
  label: r.label,
  middleware:
    r.policy === 'entitlement'
      ? 'identityGuard + entitlementGuard'
      : r.policy === 'identity_only'
        ? 'identityGuard'
        : 'none',
}));

/**
 * @param {string} path — req.path or originalUrl pathname
 * @returns {GridRule|null}
 */
export function matchProtectionRule(path) {
  const normalized = String(path || '').split('?')[0];
  for (const rule of PROTECTION_GRID_RULES) {
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
