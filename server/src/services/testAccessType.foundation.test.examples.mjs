/**
 * Phase 2 — standalone test_access_type foundation (executable).
 * Run: npm run test:test-access-type
 */
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  assertTestAccessTypeCoursePairing,
  parseStrictTestAccessType,
} from '../validators/testAccessType.js';
import {
  assertTestBasicInfoWhitelist,
  testBasicInfoBodySchema,
} from '../validators/testBasicInfo.schema.js';
import { assertTestSettingsWhitelist } from '../validators/testSettings.schema.js';
import { validateTestState } from './testValidation.service.js';
import {
  isCourseLinkedTest,
  shouldEnforceScheduleWindow,
  COURSE_LINKED_STUDENT_VISIBLE_SQL,
} from '../security/cee/courseLinkedTestAccess.service.js';
import { AppError } from '../errors/base/AppError.js';
import { TestNotFoundError } from '../errors/testAttempt/TestAttemptErrors.js';
import { assertCourseLinkedTestEligible } from '../security/cee/courseLinkedTestAccess.service.js';

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

function throwsApp(fn, messageIncludes) {
  try {
    fn();
    failed += 1;
    console.error(`  ✗ expected throw: ${messageIncludes}`);
  } catch (error) {
    const ok = error instanceof AppError && String(error.message).includes(messageIncludes);
    assert(ok, `rejects: ${messageIncludes}`);
  }
}

console.log('testAccessType foundation\n');

console.log('[existing course-linked classification]');
assert(
  isCourseLinkedTest({ course_id: 12, test_access_type: 'course_locked' }),
  'Existing course-linked test loads as course_locked / isCourseLinkedTest'
);
assert(
  isCourseLinkedTest({ course_id: 12 }),
  'Missing test_access_type still treated as course-linked when course_id is set'
);
assert(
  shouldEnforceScheduleWindow({ course_id: 12, test_access_type: 'course_locked' }) === false,
  'Course-linked tests do not use start/end as runtime gates'
);
assert(
  shouldEnforceScheduleWindow({ course_id: null, test_access_type: 'free_standalone' }) === true,
  'Standalone tests use start/end as runtime gates'
);
assert(
  shouldEnforceScheduleWindow({ course_id: null, test_access_type: 'paid_standalone' }) === true,
  'Paid standalone tests use the availability window'
);

{
  const state = validateTestState({
    course_id: 4,
    test_access_type: 'course_locked',
    title: 'MDCAT Biology',
    category: 'MDCAT',
    test_type: 'subject_wise',
    status: 'INCOMPLETE',
    duration_minutes: 0,
    max_attempts: 0,
    access_mode: 'private',
  });
  assert(state.valid, 'Existing course-linked row remains structurally valid');
}

console.log('\n[pairing]');
assert(
  assertTestAccessTypeCoursePairing('course_locked', 9).courseId === 9,
  'course_locked requires a course'
);
assert(
  assertTestAccessTypeCoursePairing('free_standalone', null).courseId === null,
  'Create free_standalone with null course'
);
assert(
  assertTestAccessTypeCoursePairing('paid_standalone', '').courseId === null,
  'Create paid_standalone with null course'
);
throwsApp(() => parseStrictTestAccessType('public_link'), 'test_access_type must be one of');
throwsApp(() => assertTestAccessTypeCoursePairing('free_standalone', 3), 'cannot be assigned to a course');
throwsApp(() => assertTestAccessTypeCoursePairing('paid_standalone', 3), 'cannot be assigned to a course');
throwsApp(() => assertTestAccessTypeCoursePairing('course_locked', null), 'A course is required');

console.log('\n[zod / whitelist]');
{
  const parsed = testBasicInfoBodySchema.safeParse({
    test_access_type: 'free_standalone',
    course_id: 8,
    title: 'Standalone Sample',
    test_type: 'subject_wise',
    subject_id: 1,
  });
  assert(!parsed.success, 'Reject free_standalone with a course');
}
{
  const parsed = testBasicInfoBodySchema.safeParse({
    test_access_type: 'paid_standalone',
    course_id: 8,
    title: 'Paid Sample',
    test_type: 'subject_wise',
    subject_id: 1,
  });
  assert(!parsed.success, 'Reject paid_standalone with a course');
}
{
  const parsed = testBasicInfoBodySchema.safeParse({
    test_access_type: 'course_locked',
    title: 'Missing course',
    test_type: 'subject_wise',
    subject_id: 1,
  });
  assert(!parsed.success, 'Require course for course_locked');
}
{
  const parsed = testBasicInfoBodySchema.safeParse({
    test_access_type: 'not_a_type',
    title: 'Bad type',
    test_type: 'subject_wise',
    subject_id: 1,
  });
  assert(!parsed.success, 'Reject invalid test_access_type');
}
{
  const parsed = testBasicInfoBodySchema.safeParse({
    test_access_type: 'free_standalone',
    course_id: null,
    title: 'Free foundation',
    test_type: 'subject_wise',
    subject_id: 2,
  });
  assert(parsed.success && parsed.data.course_id == null, 'Create free_standalone payload is valid');
}
{
  const parsed = testBasicInfoBodySchema.safeParse({
    test_access_type: 'paid_standalone',
    title: 'Paid foundation',
    test_type: 'mixed_subject',
    subject_ids: [2, 3],
  });
  assert(parsed.success && parsed.data.course_id == null, 'Create paid_standalone payload is valid');
}
{
  const parsed = testBasicInfoBodySchema.safeParse({
    course_id: 1,
    title: 'Legacy client',
    test_type: 'subject_wise',
    subject_id: 1,
  });
  assert(
    parsed.success && parsed.data.test_access_type === 'course_locked',
    'Omitted test_access_type defaults to course_locked'
  );
}
{
  const wl = assertTestBasicInfoWhitelist({
    course_id: 1,
    test_access_type: 'course_locked',
    title: 'x',
    test_type: 'subject_wise',
    subject_id: 1,
    injected: true,
  });
  assert(!wl.ok, 'Mass-assignment of unknown basic-info fields is rejected');
}
{
  const settingsWl = assertTestSettingsWhitelist({
    shuffle_questions: false,
    test_access_type: 'paid_standalone',
  });
  assert(!settingsWl.ok, 'Settings cannot mass-assign test_access_type');
}

console.log('\n[student fail-closed / private-public SQL]');
assert(
  COURSE_LINKED_STUDENT_VISIBLE_SQL.includes("access_mode = 'public'"),
  'Private course-linked tests remain hidden (access_mode public required)'
);
assert(
  COURSE_LINKED_STUDENT_VISIBLE_SQL.includes("test_access_type = 'course_locked'"),
  'Student listing/start only includes course_locked tests'
);
try {
  assertCourseLinkedTestEligible({
    id: 99,
    test_access_type: 'free_standalone',
    status: 'published',
    deleted_at: null,
    course_is_active: 1,
  });
  failed += 1;
  console.error('  ✗ standalone eligible should 404');
} catch (error) {
  assert(error instanceof TestNotFoundError, 'Standalone tests are not eligible on the course-linked path');
}

console.log('\n[wiring / publish / duplicate / drafts]');
const testService = readFileSync(path.join(serverRoot, 'src/services/test.service.js'), 'utf8');
const lifecycle = readFileSync(path.join(serverRoot, 'src/services/testLifecycle.service.js'), 'utf8');
const quizDraft = readFileSync(path.join(serverRoot, 'src/services/testQuizDraft.service.js'), 'utf8');
const listing = readFileSync(path.join(serverRoot, 'src/services/studentTestListing.queries.js'), 'utf8');
const startQueries = readFileSync(path.join(serverRoot, 'src/services/studentTestStart.queries.js'), 'utf8');
const mutation = readFileSync(path.join(serverRoot, 'src/services/testMutationAccess.service.js'), 'utf8');
const importRepo = readFileSync(
  path.join(serverRoot, 'src/repositories/testRichContentImport.repository.js'),
  'utf8'
);

assert(testService.includes('assertTestAccessTypeCoursePairing'), 'Create/update pairing is server-side');
assert(testService.includes('test_access_type'), 'test_access_type persisted on create/update');
assert(testService.includes('source.test_access_type'), 'Duplicate preserves test type');
assert(
  lifecycle.includes("SET status = 'published', public_slug = ?") &&
    !/SET status = 'published'[\s\S]*test_access_type/.test(lifecycle),
  'Publish preserves classification (does not rewrite test_access_type)'
);
assert(importRepo.includes("'course_locked'"), 'Import remains course_locked');
assert(quizDraft.includes('upsertTestQuizDraft(testId,'), 'Draft writes bind to URL test id');
assert(
  quizDraft.includes('validateAndSanitizeQuizDraftPayload(testId, body.draftPayload)'),
  'Draft payload cannot retarget another test id'
);
assert(mutation.includes('assertTestMutationAccess'), 'Unauthorized users cannot mutate another test');
assert(listing.includes("t.test_access_type = 'course_locked'"), 'Student list filters course_locked');
assert(startQueries.includes("t.test_access_type = 'course_locked'"), 'Student start lock is course_locked only');
assert(testService.includes('VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'), 'Create INSERT uses bound parameters');

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
process.exit(0);
