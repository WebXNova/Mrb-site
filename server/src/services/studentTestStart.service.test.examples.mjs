/**
 * Unit test examples for studentTestStart.service.js (Phase 2A).
 *
 * Run: node src/services/studentTestStart.service.test.examples.mjs
 */
import {
  assertAttemptsRemaining,
  assertTestWithinAvailabilityWindow,
  validateTestExistsAndPublished,
} from './studentTestStart.service.js';
import { parseStudentTestIdParam } from '../validators/studentTestStart.schema.js';
import { TestNotAccessibleError, TestNotFoundError } from '../errors/testAttempt/TestAttemptErrors.js';
import { ApiError } from '../utils/apiError.js';

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

console.log('studentTestStart.service — unit test examples\n');

expectThrow(
  () => validateTestExistsAndPublished(null),
  TestNotFoundError,
  'missing test → TestNotFoundError'
);

expectThrow(
  () => validateTestExistsAndPublished({ id: 1, status: 'DRAFT', deleted_at: null }),
  TestNotAccessibleError,
  'unpublished test → TestNotAccessibleError'
);

assert(
  validateTestExistsAndPublished({ id: 1, status: 'published', deleted_at: null }) === undefined,
  'published test passes validation'
);

expectThrow(
  () =>
    assertTestWithinAvailabilityWindow(
      { id: 1, start_date: '2099-01-01T00:00:00.000Z' },
      new Date('2026-01-01T00:00:00.000Z')
    ),
  TestNotAccessibleError,
  'future start_date blocked'
);

assert(
  assertTestWithinAvailabilityWindow(
    { id: 1, start_date: null, end_date: null },
    new Date()
  ) === undefined,
  'open window passes'
);

expectThrow(
  () => assertAttemptsRemaining(2, 2, 1),
  ApiError,
  'max attempts exhausted → ApiError'
);

{
  const parsed = parseStudentTestIdParam('12');
  assert(parsed.ok && parsed.id === 12, 'valid testId param');
}

{
  const parsed = parseStudentTestIdParam('abc');
  assert(!parsed.ok, 'invalid testId param rejected');
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
