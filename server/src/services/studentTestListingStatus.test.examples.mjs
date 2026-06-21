/**
 * Unit test examples for studentTestListingStatus.js
 *
 * Run: node src/services/studentTestListingStatus.test.examples.mjs
 */
import {
  computeStudentTestListingStatus,
  STUDENT_TEST_LISTING_STATUSES,
} from './studentTestListingStatus.js';

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

console.log('studentTestListingStatus — unit test examples\n');

assert(STUDENT_TEST_LISTING_STATUSES.length === 3, 'defines three statuses');

{
  const r = computeStudentTestListingStatus({
    maxAttempts: 3,
    attemptsUsed: 0,
    activeAttemptId: null,
  });
  assert(r.status === 'available' && r.attempts_remaining === 3, 'no attempts → available');
}

{
  const r = computeStudentTestListingStatus({
    maxAttempts: 3,
    attemptsUsed: 1,
    activeAttemptId: 44,
  });
  assert(
    r.status === 'in_progress' && r.active_attempt_id === 44 && r.attempts_remaining === 2,
    'active attempt → in_progress with active_attempt_id'
  );
}

{
  const r = computeStudentTestListingStatus({
    maxAttempts: 2,
    attemptsUsed: 2,
    activeAttemptId: null,
  });
  assert(r.status === 'completed' && r.attempts_remaining === 0, 'max attempts exhausted → completed');
}

{
  const r = computeStudentTestListingStatus({
    maxAttempts: 1,
    attemptsUsed: 1,
    activeAttemptId: 99,
  });
  assert(r.status === 'in_progress' && r.attempts_remaining === 0, 'in_progress wins over completed');
}

{
  const r = computeStudentTestListingStatus({
    maxAttempts: 0,
    attemptsUsed: 5,
    activeAttemptId: null,
  });
  assert(r.status === 'available' && r.attempts_remaining === null, 'unlimited max_attempts stays available');
}

{
  const r = computeStudentTestListingStatus({
    maxAttempts: 3,
    attemptsUsed: 1,
    activeAttemptId: null,
    allowRetake: false,
  });
  assert(r.status === 'completed' && r.attempts_remaining === 0, 'retake disabled + prior attempt → completed');
}

{
  const r = computeStudentTestListingStatus({
    maxAttempts: 3,
    attemptsUsed: 1,
    activeAttemptId: null,
    allowRetake: true,
  });
  assert(r.status === 'available' && r.attempts_remaining === 2, 'retake enabled + under max → available');
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
