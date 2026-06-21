/**
 * Legacy student runtime deprecation — G-RT-02.
 *
 * Fail-closed by default (410). Optional LEGACY_RUNTIME_ALLOW re-enables old routers
 * for emergency rollback only; CEE entitlement still applies via protection grid.
 */

import { asyncHandler } from '../utils/asyncHandler.js';
import { env } from '../config/env.js';
import {
  logSecurityEvent,
  TEST_SECURITY_ACTIONS,
} from '../services/testSecurityAudit.service.js';
import {
  CANONICAL_STUDENT_RUNTIME_ROUTES,
  LEGACY_RUNTIME_MIGRATION_MAP,
  LEGACY_STUDENT_RUNTIME_DISABLED,
  matchLegacyRuntimeOperation,
} from './studentRuntimeCanonical.js';

/**
 * @param {import('express').Request} req
 */
function buildMigrationPayload(req) {
  const path = req.originalUrl?.split('?')[0] || req.path || '';
  const operationKey = matchLegacyRuntimeOperation(path);
  const migration = operationKey ? LEGACY_RUNTIME_MIGRATION_MAP[operationKey] : null;
  const canonicalKey = migration?.canonical ?? null;
  const canonical = canonicalKey ? CANONICAL_STUDENT_RUNTIME_ROUTES[canonicalKey] : null;

  return {
    success: false,
    error: LEGACY_STUDENT_RUNTIME_DISABLED,
    message:
      'Legacy student test runtime endpoints are disabled. Use the canonical slug or portal runtime.',
    legacyPath: path,
    legacyMethod: req.method,
    migration: migration
      ? {
          operation: operationKey,
          legacy: migration.legacy,
          canonical: canonical
            ? { method: canonical.method, path: canonical.path, stack: canonical.stack }
            : null,
          formerBypasses: migration.bypassesBeforeGrt02,
        }
      : null,
    documentation: 'Mrb-site/server/docs/student-runtime-architecture.md',
  };
}

/**
 * Express handler — rejects all legacy student runtime traffic (default).
 */
export const rejectLegacyStudentRuntimeRequest = asyncHandler(async (req, res) => {
  const path = req.originalUrl?.split('?')[0] || req.path || '';

  logSecurityEvent({
    action: TEST_SECURITY_ACTIONS.LEGACY_ENDPOINT_ACCESS,
    userId: req.user?.id ?? null,
    reason: 'legacy_student_runtime_disabled',
    errorCode: LEGACY_STUDENT_RUNTIME_DISABLED,
    outcome: 'denied',
    route: path,
    context: 'legacyRuntimeDeprecation.reject',
    metadata: {
      method: req.method,
      allowLegacyFlag: env.runtime.allowLegacyStudentEndpoints,
    },
  });

  res.set('Deprecation', 'true');
  res.set('Sunset', '2026-09-01');
  res.set('Link', '</api/tests>; rel="successor-version"');

  return res.status(410).json(buildMigrationPayload(req));
});

/**
 * @returns {boolean}
 */
export function isLegacyStudentRuntimeEnabled() {
  return env.runtime.allowLegacyStudentEndpoints === true;
}
