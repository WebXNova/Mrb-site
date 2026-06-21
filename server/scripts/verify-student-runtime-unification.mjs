/**
 * Static verification — student runtime unification (G-RT-01 / G-RT-02).
 * Run: node scripts/verify-student-runtime-unification.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { validateProtectionGridAtStartup } from '../src/security/cee/protectionGridValidator.js';
import { matchProtectionRule } from '../src/security/cee/protectionGrid.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.join(__dirname, '..');
const clientRoot = path.join(serverRoot, '..', 'client');

function read(rel) {
  return fs.readFileSync(path.join(serverRoot, rel), 'utf8');
}

function readClient(rel) {
  return fs.readFileSync(path.join(clientRoot, rel), 'utf8');
}

function ok(label) {
  console.log(`PASS ${label}`);
}

function fail(label, detail = '') {
  throw new Error(`${label}${detail ? `: ${detail}` : ''}`);
}

function assertMatch(label, content, pattern) {
  if (!pattern.test(content)) fail(label, `missing ${pattern}`);
  ok(label);
}

function assertNoMatch(label, content, pattern) {
  if (pattern.test(content)) fail(label, `forbidden ${pattern}`);
  ok(label);
}

console.log('Student runtime unification — G-RT-01 / G-RT-02\n');

// --- Protection grid startup ---
const gridResult = await validateProtectionGridAtStartup({ throwOnFailure: false });
if (!gridResult.ok) {
  fail('protection grid startup validation', gridResult.issues.join('; '));
}
ok('protection grid startup validation');

// --- Legacy paths require entitlement (no bypass) ---
for (const probe of [
  '/api/attempt/1',
  '/api/attempt/tests/1/active',
  '/api/attempts/1/result',
  '/api/attempts/1/submit',
  '/api/attempts/1/answers',
]) {
  const rule = matchProtectionRule(probe);
  if (!rule || rule.policy !== 'entitlement') {
    fail(`CEE entitlement required for ${probe}`, `policy=${rule?.policy ?? 'none'}`);
  }
}
ok('legacy runtime paths require CEE entitlement');

// --- Default mount uses deprecation router ---
const appJs = read('src/app.js');
assertMatch('app.js — legacy deprecation default', appJs, /legacyRuntimeRoutes/);
assertMatch('app.js — conditional legacy rollback', appJs, /isLegacyStudentRuntimeEnabled/);

// --- Client must not use legacy result API in test-result feature ---
const testResultApi = readClient('src/features/test-result/api/testResultApi.js');
assertMatch('client testResultApi uses student portal', testResultApi, /studentApi\.resultDetail/);
assertNoMatch(
  'client testResultApi avoids legacy /attempts result',
  testResultApi,
  /\/attempts\/\$\{/
);

// --- adminApi legacy result marked deprecated ---
const adminApi = readClient('src/api/adminApi.js');
assertMatch('adminApi defines canonical testsApi.getResult', adminApi, /getResult:\s*\(slug/);
if (!adminApi.includes('@deprecated') && adminApi.includes('fetchByAttemptId')) {
  assertMatch('adminApi resultApi deprecated marker', adminApi, /deprecated|LEGACY/);
}

// --- Canonical module exists ---
assertMatch(
  'studentRuntimeCanonical module',
  read('src/runtime/studentRuntimeCanonical.js'),
  /CANONICAL_STUDENT_RUNTIME_ROUTES/
);

console.log('\nAll student runtime unification checks passed.');
