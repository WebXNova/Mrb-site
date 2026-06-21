/**
 * Static verification for public test attempt creation (GET /api/tests/:slug, POST verify-code).
 */
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.dirname(fileURLToPath(import.meta.url));

let passed = 0;
let failed = 0;

function ok(msg) {
  passed += 1;
  console.log(`  ✓ ${msg}`);
}

function fail(msg) {
  failed += 1;
  console.error(`  ✗ ${msg}`);
}

console.log('Public test attempt flow verification\n');

const coursesRoutesSrc = await fs.readFile(path.join(root, '../src/routes/courses.routes.js'), 'utf8');
if (coursesRoutesSrc.includes("router.get('/public/tests/:slug', getPublicTestMeta)")) {
  ok('route GET /courses/public/tests/:slug registered for public test meta');
} else {
  fail('GET /courses/public/tests/:slug route missing');
}

const routesSrc = await fs.readFile(path.join(root, '../src/routes/tests.routes.js'), 'utf8');
if (!routesSrc.includes('getPublicTestMeta')) {
  ok('entitled /api/tests routes remain entitlement-only');
} else {
  fail('public meta handler should not be mounted under /api/tests');
}

if (routesSrc.includes("router.post('/:slug/verify-code', postVerifyTestCode)")) {
  ok('route POST /:slug/verify-code registered');
} else {
  fail('verify-code route missing');
}

const controllerSrc = await fs.readFile(
  path.join(root, '../src/controllers/publicTests.controller.js'),
  'utf8'
);
if (controllerSrc.includes('getPublicTestMeta') && controllerSrc.includes('loadPublishedTestMetaBySlug')) {
  ok('controller loads published test meta by slug');
} else {
  fail('getPublicTestMeta handler missing');
}

if (controllerSrc.includes('studentId') && !controllerSrc.includes('studentUser')) {
  ok('controller passes canonical studentId');
} else {
  fail('controller still uses studentUser or missing studentId');
}

if (controllerSrc.includes('Authentication required') && controllerSrc.includes('Missing authenticated student identity')) {
  ok('controller validates authenticated identity');
} else {
  fail('controller auth validation incomplete');
}

const queriesSrc = await fs.readFile(path.join(root, '../src/services/testAttempt.queries.js'), 'utf8');
if (
  queriesSrc.includes('student_id') &&
  queriesSrc.includes('attempt_number') &&
  queriesSrc.includes('INSERT INTO test_attempts')
) {
  ok('entitled attempt insert includes student_id and attempt_number');
} else {
  fail('entitled attempt insert missing required columns');
}

if (
  queriesSrc.includes('DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? MINUTE)') &&
  queriesSrc.includes('UTC_TIMESTAMP()')
) {
  ok('entitled attempt insert derives expires_at from MySQL UTC clock');
} else {
  fail('entitled attempt insert missing MySQL DATE_ADD expiry strategy');
}

if (queriesSrc.includes('FOR UPDATE')) {
  ok('attempt number allocation uses row lock');
} else {
  fail('attempt number lock missing');
}

const serviceSrc = await fs.readFile(path.join(root, '../src/services/testAttempt.service.js'), 'utf8');
if (serviceSrc.includes('Cannot create test attempt without test slug')) {
  ok('service validates slug before DB');
} else {
  fail('slug validation missing');
}

if (serviceSrc.includes('Missing authenticated student identity')) {
  ok('service rejects missing studentId');
} else {
  fail('studentId validation missing');
}

if (serviceSrc.includes('INSERT_ENTITLED_TEST_ATTEMPT_SQL') && serviceSrc.includes('beginTransaction')) {
  ok('service uses transactional entitled attempt insert');
} else {
  fail('transactional insert missing');
}

if (
  serviceSrc.includes('buildInsertEntitledTestAttemptParams') &&
  queriesSrc.includes('export function buildInsertEntitledTestAttemptParams')
) {
  ok('entitled attempt insert uses centralized param builder');
} else {
  fail('buildInsertEntitledTestAttemptParams missing from service or queries');
}

if (
  serviceSrc.includes('assertEntitledAttemptInsertContext') &&
  serviceSrc.includes('ATTEMPT_INSERT_ZERO_ROWS')
) {
  ok('entitled attempt insert validates ids and logs zero-row inserts');
} else {
  fail('insert context validation or zero-row logging missing');
}

if (
  serviceSrc.includes('assertStudentIdForAttemptInsert') &&
  serviceSrc.includes('MISSING_STUDENT_ID') &&
  serviceSrc.includes('LOCK_ACTIVE_ENTITLED_ATTEMPT_SQL')
) {
  ok('service hard-validates studentId and resumes active attempts');
} else {
  fail('studentId guard or resume logic missing');
}

const resultQueries = await fs.readFile(
  path.join(root, '../src/services/testResult.queries.js'),
  'utf8'
);
if (
  resultQueries.includes('student_id') &&
  resultQueries.includes('INSERT INTO test_results') &&
  resultQueries.includes('a.student_id')
) {
  ok('test result insert includes student_id from attempt row');
} else {
  fail('test result insert missing student_id');
}

if (
  serviceSrc.includes('ATTEMPT_CREATE_REQUEST') &&
  serviceSrc.includes('ATTEMPT_CREATE_SUCCESS') &&
  serviceSrc.includes('ATTEMPT_CREATE_FAILURE')
) {
  ok('structured attempt create logs present');
} else {
  fail('structured attempt create logs missing');
}

{
  const getStartBlock =
    controllerSrc.match(/export const getStartTest[\s\S]*?export const patchSaveAnswer/)?.[0] || '';
  if (getStartBlock && !getStartBlock.includes('consumeAttemptNonce')) {
    ok('getStartTest does not rotate attempt token on load');
  } else {
    fail('getStartTest still rotates token on read-only load');
  }
}

if (controllerSrc.includes('ATTEMPT_TOKEN_VALIDATION_FAILURE')) {
  ok('controller logs attempt token validation failures');
} else {
  fail('controller token validation logging missing');
}

if (serviceSrc.includes('TEST_ATTEMPT_CREATE') && serviceSrc.includes('TEST_ATTEMPT_DENIED')) {
  ok('security audit events wired');
} else {
  fail('security audit events missing');
}

if (!serviceSrc.includes('student_name, access_code_label, status, started_at') || serviceSrc.includes('INSERT_ENTITLED_TEST_ATTEMPT_SQL')) {
  ok('legacy broken insert replaced');
} else {
  fail('legacy insert without student_id may still be present');
}

const { matchProtectionRule } = await import('../src/security/cee/protectionGrid.js');
const metaRule = matchProtectionRule('/api/courses/public/tests/txt-4');
const verifyRule = matchProtectionRule('/api/tests/txt-4/verify-code');
if (metaRule?.policy === 'public' && metaRule?.label === 'courses_public_catalog') {
  ok('GET /api/courses/public/tests/:slug matches public catalog policy');
} else {
  fail(`meta route policy wrong: ${metaRule?.policy}/${metaRule?.label}`);
}
if (verifyRule?.policy === 'entitlement') {
  ok('POST /api/tests/:slug/verify-code still requires entitlement');
} else {
  fail(`verify-code policy wrong: ${verifyRule?.policy}`);
}

const clientSrc = await fs.readFile(
  path.join(root, '../../client/src/api/adminApi.js'),
  'utf8'
);
if (clientSrc.includes('http.get(`/courses/public/tests/${slug}`')) {
  ok('frontend calls GET /courses/public/tests/:slug');
} else {
  fail('frontend meta URL mismatch');
}

const identityGuardSrc = await fs.readFile(
  path.join(root, '../src/security/cee/identityGuard.js'),
  'utf8'
);
if (
  identityGuardSrc.includes("new UnauthorizedError(error.message") &&
  !identityGuardSrc.includes('new UnauthorizedError({')
) {
  ok('identityGuard constructs UnauthorizedError with message string');
} else {
  fail('identityGuard UnauthorizedError constructor misuse');
}

const requireEntSrc = await fs.readFile(
  path.join(root, '../src/security/cee/requireEntitlement.js'),
  'utf8'
);
if (
  requireEntSrc.includes("new UnauthorizedError('Authentication required.'") &&
  !requireEntSrc.includes('new UnauthorizedError({')
) {
  ok('requireEntitlement constructs UnauthorizedError with message string');
} else {
  fail('requireEntitlement UnauthorizedError constructor misuse');
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
