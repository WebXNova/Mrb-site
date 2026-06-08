/**
 * Static verification for GET /api/student/tests (Phase 1C).
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

console.log('Student test listing API verification\n');

const routesSrc = await fs.readFile(path.join(root, '../src/routes/student.routes.js'), 'utf8');
if (routesSrc.includes("router.get('/tests', getStudentTests)")) ok('route GET /tests registered');
else fail('route GET /tests missing');

const { getStudentTests } = await import('../src/controllers/studentTests.controller.js');
if (typeof getStudentTests === 'function') ok('controller exported');
else fail('controller missing');

const { listStudentEligibleTests } = await import('../src/services/studentTestListing.service.js');
const { LIST_STUDENT_ELIGIBLE_TESTS_SQL, COUNT_STUDENT_ELIGIBLE_TESTS_SQL } = await import(
  '../src/services/studentTestListing.queries.js'
);
const { studentOwnsTest } = await import('../src/services/testOwnership.service.js');
const { studentTestListQuerySchema } = await import('../src/validators/studentTestList.schema.js');

if (typeof listStudentEligibleTests === 'function') ok('service exported');
else fail('service missing');

if (typeof studentOwnsTest === 'function') ok('studentOwnsTest exported');
else fail('studentOwnsTest missing');

for (const sql of [LIST_STUDENT_ELIGIBLE_TESTS_SQL, COUNT_STUDENT_ELIGIBLE_TESTS_SQL]) {
  if (sql.includes('enrollments') && sql.includes("status = ?") && sql.includes('deleted_at IS NULL')) {
    ok('SQL enforces ownership + published + not deleted');
  } else {
    fail('SQL missing required filters');
  }
}

const listSrc = await fs.readFile(path.join(root, '../src/services/studentTestListing.queries.js'), 'utf8');
if (!listSrc.includes('${studentId}') && listSrc.includes('LIMIT ? OFFSET ?')) {
  ok('pagination uses bound limit/offset');
} else {
  fail('pagination SQL issue');
}

if (listSrc.includes('STUDENT_TEST_ATTEMPT_AGGREGATE_JOIN_SQL') && listSrc.includes('GROUP BY a.test_id')) {
  ok('attempt stats use single aggregate join (no N+1)');
} else {
  fail('missing attempt aggregate join');
}

const statusSrc = await fs.readFile(path.join(root, '../src/services/studentTestListingStatus.js'), 'utf8');
if (statusSrc.includes('in_progress') && statusSrc.includes('computeStudentTestListingStatus')) {
  ok('status calculation module present');
} else {
  fail('status calculation module missing');
}

const dtoSrc = await fs.readFile(path.join(root, '../src/dto/studentTestList.dto.js'), 'utf8');
for (const field of [
  'id',
  'title',
  'duration_minutes',
  'max_attempts',
  'passing_percentage',
  'status',
  'active_attempt_id',
  'attempts_used',
  'attempts_remaining',
]) {
  if (dtoSrc.includes(field)) ok(`response field ${field}`);
  else fail(`response field ${field} missing`);
}

const parsed = studentTestListQuerySchema.safeParse({ page: '2', limit: '10' });
if (parsed.success && parsed.data.page === 2 && parsed.data.limit === 10) ok('validation coerces query params');
else fail('validation coercion failed');

const badLimit = studentTestListQuerySchema.safeParse({ limit: 999 });
if (!badLimit.success) ok('validation rejects excessive limit');
else fail('validation should cap limit');

const gridSrc = await fs.readFile(path.join(root, '../src/security/cee/protectionGrid.js'), 'utf8');
if (gridSrc.includes('/api\\/student') && gridSrc.includes("policy: 'entitlement'")) {
  ok('student namespace entitlement-protected');
} else {
  fail('student namespace not entitlement-protected');
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
