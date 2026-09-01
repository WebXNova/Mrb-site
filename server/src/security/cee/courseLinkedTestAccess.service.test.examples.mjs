import {
  isCourseLinkedTest,
  shouldEnforceScheduleWindow,
  isPublicAccessMode,
  assertCourseLinkedTestEligible,
  assertCourseLinkedTestCourseMatch,
  assertCourseLinkedTestReleasedToStudents,
  assertCourseLinkedTestMetaAccessible,
} from './courseLinkedTestAccess.service.js';
import { TestNotAccessibleError, TestNotFoundError } from '../../errors/testAttempt/TestAttemptErrors.js';

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

function expectThrow(fn, ErrorType, message) {
  try {
    fn();
    failed += 1;
    console.error(`  ✗ ${message} (no throw)`);
  } catch (error) {
    if (error instanceof ErrorType) {
      passed += 1;
      console.log(`  ✓ ${message}`);
    } else {
      failed += 1;
      console.error(`  ✗ ${message} (wrong error)`, error);
    }
  }
}

const publishedPrivate = {
  id: 10,
  course_id: 7,
  status: 'published',
  deleted_at: null,
  course_is_active: 1,
  access_mode: 'private',
};

const publishedAvailable = {
  ...publishedPrivate,
  id: 11,
  access_mode: 'public',
};

console.log('courseLinkedTestAccess.service — unit test examples\n');

assert(isCourseLinkedTest({ course_id: 1 }), 'course_id marks course-linked test');
assert(!isCourseLinkedTest({ course_id: null }), 'null course_id is not course-linked');
assert(!shouldEnforceScheduleWindow({ course_id: 3 }), 'course-linked skips schedule window');
assert(shouldEnforceScheduleWindow({ course_id: null, test_access_type: 'paid_standalone' }), 'paid standalone enforces schedule');
assert(isPublicAccessMode({ access_mode: 'public' }), 'available (public) access mode detected');
assert(!isPublicAccessMode({ access_mode: 'private' }), 'private access mode is admin-only');

expectThrow(
  () => assertCourseLinkedTestEligible({ id: 1, status: 'DRAFT', deleted_at: null, course_is_active: 1 }),
  TestNotAccessibleError,
  'unpublished test throws TestNotAccessibleError'
);

expectThrow(
  () => assertCourseLinkedTestEligible(null),
  TestNotFoundError,
  'missing row throws TestNotFoundError'
);

expectThrow(
  () => assertCourseLinkedTestCourseMatch({ id: 1, course_id: 2 }, 1),
  TestNotAccessibleError,
  'wrong course throws TestNotAccessibleError'
);

expectThrow(
  () => assertCourseLinkedTestReleasedToStudents(publishedPrivate),
  TestNotFoundError,
  'private test is not released to students'
);

assert(
  assertCourseLinkedTestReleasedToStudents(publishedAvailable) === undefined,
  'available (public) test may be released to enrolled students'
);

console.log('\nPRIVATE — admin only (students never see or start)\n');

expectThrow(
  () => assertCourseLinkedTestMetaAccessible(publishedPrivate, 42, 7),
  TestNotFoundError,
  'enrolled student cannot view private test'
);

expectThrow(
  () => assertCourseLinkedTestReleasedToStudents(publishedPrivate, { testId: 10 }),
  TestNotFoundError,
  'enrolled student cannot access private test by slug/id'
);

expectThrow(
  () => assertCourseLinkedTestMetaAccessible(publishedPrivate, 99, 99),
  TestNotFoundError,
  'non-enrolled student cannot see/access private test'
);

expectThrow(
  () => assertCourseLinkedTestMetaAccessible(publishedPrivate, null, null),
  TestNotFoundError,
  'logged-out user cannot access private test'
);

console.log('\nAVAILABLE — enrolled students of assigned course only\n');

assert(
  assertCourseLinkedTestMetaAccessible(publishedAvailable, 42, 7) === undefined,
  'enrolled student can view available test'
);

assert(
  assertCourseLinkedTestCourseMatch(publishedAvailable, 7) === undefined,
  'enrolled student can start available test (course match)'
);

expectThrow(
  () => assertCourseLinkedTestMetaAccessible(publishedAvailable, 42, 99),
  TestNotFoundError,
  'non-enrolled / wrong-course student cannot view available test'
);

expectThrow(
  () => assertCourseLinkedTestCourseMatch(publishedAvailable, 99),
  TestNotAccessibleError,
  'student enrolled in another course cannot start this test'
);

expectThrow(
  () => assertCourseLinkedTestMetaAccessible(publishedAvailable, null, null),
  TestNotFoundError,
  'logged-out user cannot view available course-linked test'
);

expectThrow(
  () => assertCourseLinkedTestMetaAccessible(publishedAvailable, 0, 0),
  TestNotFoundError,
  'changing identity to empty cannot bypass authorization'
);

expectThrow(
  () => assertCourseLinkedTestMetaAccessible(null, 42, 7),
  TestNotFoundError,
  'unknown slug/id is 404 (no enumeration)'
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
