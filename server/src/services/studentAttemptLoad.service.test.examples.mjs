/**
 * Unit test examples for studentAttemptLoad (Phase 2B).
 *
 * Run: node src/services/studentAttemptLoad.service.test.examples.mjs
 */
import {
  assertAttemptBelongsToStudent,
  assertAttemptLoadable,
} from './studentAttemptLoad.service.js';
import {
  computeRemainingTimeSeconds,
  toStudentAttemptLoadQuestionsDto,
  FORBIDDEN_STUDENT_ATTEMPT_LOAD_KEYS,
} from '../dto/studentAttemptLoad.dto.js';
import { parseStudentAttemptIdParam } from '../validators/studentAttemptLoad.schema.js';
import {
  AttemptInvalidStateError,
  AttemptNotFoundError,
  AttemptNotOwnedError,
  AttemptExpiredStateError,
} from '../errors/testAttempt/TestAttemptErrors.js';

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
      console.error(`  ✗ ${message}`, error);
    }
  }
}

async function expectThrowAsync(fn, ErrorType, message) {
  try {
    await fn();
    failed += 1;
    console.error(`  ✗ ${message} (no throw)`);
  } catch (error) {
    if (error instanceof ErrorType) {
      passed += 1;
      console.log(`  ✓ ${message}`);
    } else {
      failed += 1;
      console.error(`  ✗ ${message}`, error);
    }
  }
}

console.log('studentAttemptLoad — unit test examples\n');

assert(computeRemainingTimeSeconds('2099-01-01T00:00:00.000Z') > 0, 'future expiry has remaining seconds');
assert(computeRemainingTimeSeconds('2020-01-01T00:00:00.000Z') === 0, 'past expiry clamps to zero');

await expectThrowAsync(
  () =>
    assertAttemptLoadable({
      id: 1,
      status: 'submitted',
      test_status: 'published',
      test_deleted_at: null,
      expires_at: '2099-01-01T00:00:00.000Z',
    }, Date.parse('2026-01-01T00:00:00.000Z')),
  AttemptInvalidStateError,
  'submitted attempt not loadable'
);

await expectThrowAsync(
  () =>
    assertAttemptLoadable(
      {
        id: 1,
        status: 'in_progress',
        test_status: 'published',
        test_deleted_at: null,
        expires_at: '2020-01-01T00:00:00.000Z',
      },
      Date.parse('2026-01-01T00:00:00.000Z'),
      { markExpired: false }
    ),
  AttemptExpiredStateError,
  'expired attempt blocked'
);

expectThrow(
  () => assertAttemptBelongsToStudent({ id: 1, user_id: 2, student_id: 2 }, 1),
  AttemptNotOwnedError,
  'wrong student blocked'
);

{
  const questions = toStudentAttemptLoadQuestionsDto([
    {
      questionId: 10,
      questionText: '<p>Sample</p>',
      marks: 1,
      options: [{ optionId: 100, optionText: 'A' }],
    },
  ]);
  const serialized = JSON.stringify(questions);
  const leaks = FORBIDDEN_STUDENT_ATTEMPT_LOAD_KEYS.filter((key) => serialized.includes(`"${key}"`));
  assert(leaks.length === 0, 'questions payload has no forbidden answer keys');
  assert(questions[0].question_id === 10 && questions[0].options[0].option_id === 100, 'question shape correct');
}

{
  const parsed = parseStudentAttemptIdParam('7');
  assert(parsed.ok && parsed.id === 7, 'valid attempt id');
}

expectThrow(
  () => assertAttemptBelongsToStudent(null, 1),
  AttemptNotFoundError,
  'missing attempt → not found'
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
