/**
 * G-RT-02 — Legacy student runtime security + unification tests.
 *
 * Run: npm run test:student-runtime-unification
 */
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  CANONICAL_STUDENT_RUNTIME_ROUTES,
  LEGACY_RUNTIME_MIGRATION_MAP,
  LEGACY_STUDENT_RUNTIME_DISABLED,
  matchLegacyRuntimeOperation,
  STUDENT_RUNTIME_STACK,
} from './studentRuntimeCanonical.js';
import {
  matchProtectionRule,
  PROTECTION_GRID_RULES,
} from '../security/cee/protectionGrid.js';
import {
  CEE_PROTECTED_NAMESPACES,
  matchProtectedNamespace,
} from '../security/cee/protectedNamespaceRegistry.js';
import { APPLICATION_API_MOUNTS } from '../security/cee/applicationMountManifest.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.join(__dirname, '..', '..');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${message}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${message}`);
  }
}

function mustContain(fileRel, needles, label) {
  const filePath = path.join(serverRoot, fileRel);
  assert(existsSync(filePath), `file exists: ${fileRel}`);
  const text = readFileSync(filePath, 'utf8');
  for (const needle of needles) {
    assert(text.includes(needle), `${label}: "${needle}"`);
  }
}

console.log('studentRuntimeLegacy — G-RT-02 security\n');

// --- CEE grid covers legacy namespaces ---
{
  const attemptProbe = '/api/attempt/99';
  const attemptsProbe = '/api/attempts/42/result';
  const attemptRule = matchProtectionRule(attemptProbe);
  const attemptsRule = matchProtectionRule(attemptsProbe);

  assert(attemptRule?.policy === 'entitlement', 'GET /api/attempt/* requires entitlement');
  assert(attemptsRule?.policy === 'entitlement', 'GET /api/attempts/* requires entitlement');
  assert(attemptRule?.label === 'legacy_attempt_runtime', 'attempt grid label registered');
  assert(attemptsRule?.label === 'legacy_attempts_runtime', 'attempts grid label registered');
}

// --- Protected namespace registry ---
{
  const attemptNs = matchProtectedNamespace('/api/attempt/foo');
  const attemptsNs = matchProtectedNamespace('/api/attempts/foo');
  assert(attemptNs?.namespace === '/api/attempt', 'attempt namespace registered');
  assert(attemptsNs?.namespace === '/api/attempts', 'attempts namespace registered');

  const labels = new Set(CEE_PROTECTED_NAMESPACES.map((d) => d.label));
  assert(labels.has('legacy_attempt_runtime'), 'registry legacy_attempt_runtime');
  assert(labels.has('legacy_attempts_runtime'), 'registry legacy_attempts_runtime');
}

// --- Application mount manifest ---
{
  const mounts = APPLICATION_API_MOUNTS.map((m) => m.mountPath);
  assert(mounts.includes('/api/attempt'), 'manifest includes /api/attempt');
  assert(mounts.includes('/api/attempts'), 'manifest includes /api/attempts');
}

// --- Default deprecation wiring in app.js ---
mustContain(
  'src/app.js',
  [
    'isLegacyStudentRuntimeEnabled',
    'legacyRuntimeRoutes',
    "app.use('/api/attempt', legacyRuntimeRoutes)",
  ],
  'app.js legacy deprecation'
);

mustContain(
  'src/runtime/legacyRuntimeDeprecation.js',
  [
    'LEGACY_STUDENT_RUNTIME_DISABLED',
    'TEST_SECURITY_ACTIONS.LEGACY_ENDPOINT_ACCESS',
    'status(410)',
  ],
  'legacyRuntimeDeprecation handler'
);

// --- Legacy path → canonical migration map ---
{
  assert(
    matchLegacyRuntimeOperation('/api/attempts/7/result') === 'getResult',
    'maps legacy result path'
  );
  assert(
    matchLegacyRuntimeOperation('/api/attempts/7/submit') === 'postSubmit',
    'maps legacy submit path'
  );
  assert(
    matchLegacyRuntimeOperation('/api/attempt/7') === 'getAttemptById',
    'maps legacy get attempt'
  );

  const resultMigration = LEGACY_RUNTIME_MIGRATION_MAP.getResult;
  assert(resultMigration.canonical === 'portalResult', 'legacy result → portalResult');
  assert(
    CANONICAL_STUDENT_RUNTIME_ROUTES.portalResult.path === '/api/student/results/:attemptId',
    'canonical portal result path'
  );
  assert(
    resultMigration.bypassesBeforeGrt02.includes('cee_entitlement'),
    'documents former CEE bypass'
  );
}

// --- Canonical slug stack completeness ---
{
  const slugRoutes = Object.values(CANONICAL_STUDENT_RUNTIME_ROUTES).filter(
    (r) => r.stack === STUDENT_RUNTIME_STACK.SLUG && r.cee
  );
  assert(slugRoutes.length >= 5, 'slug runtime defines prep/start/load/save/submit');
}

// --- Legacy disabled error code ---
assert(
  LEGACY_STUDENT_RUNTIME_DISABLED === 'LEGACY_STUDENT_RUNTIME_DISABLED',
  'legacy disabled error code stable'
);

// --- No unregistered entitlement orphan for legacy ---
{
  const entitlementRules = PROTECTION_GRID_RULES.filter((r) => r.policy === 'entitlement');
  const legacyRules = entitlementRules.filter((r) =>
    /attempt/i.test(r.label)
  );
  assert(legacyRules.length >= 2, 'legacy entitlement grid rules present');
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exitCode = 1;
}
