/**
 * G-RT-04 — test retake policy unit tests.
 *
 * Run: npm run test:retake-policy
 */
import {
  assertCanCreateNewTestAttempt,
  evaluateRetakePolicy,
  TERMINAL_ATTEMPT_STATUSES,
} from './testRetakePolicy.service.js';
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

console.log('testRetakePolicy.service — G-RT-04\n');

assert(
  TERMINAL_ATTEMPT_STATUSES.includes('submitted') &&
    TERMINAL_ATTEMPT_STATUSES.includes('expired'),
  'terminal statuses include submitted and expired'
);

{
  const r = evaluateRetakePolicy(
    { max_attempts: 3 },
    { totalAttempts: 0, hasActiveAttempt: false }
  );
  assert(r.canCreateNew === true && r.maxAttempts === 3, 'no attempts — first start allowed');
}

{
  const r = evaluateRetakePolicy(
    { max_attempts: 1 },
    { totalAttempts: 1, hasActiveAttempt: false }
  );
  assert(r.canCreateNew === false && r.denyCode === 'MAX_ATTEMPTS_REACHED', 'max_attempts=1 blocks second attempt');
}

{
  const r = evaluateRetakePolicy(
    { max_attempts: 3 },
    { totalAttempts: 1, hasActiveAttempt: true }
  );
  assert(r.canResumeActive === true && r.canCreateNew === false, 'in_progress resume allowed');
}

{
  const r = evaluateRetakePolicy(
    { max_attempts: 2 },
    { totalAttempts: 1, hasActiveAttempt: false }
  );
  assert(r.canCreateNew === true, 'second attempt allowed under max_attempts=2');
}

{
  const r = evaluateRetakePolicy(
    { max_attempts: 2 },
    { totalAttempts: 2, hasActiveAttempt: false }
  );
  assert(r.canCreateNew === false && r.denyCode === 'MAX_ATTEMPTS_REACHED', 'max_attempts caps retakes');
}

{
  const r = evaluateRetakePolicy(
    { max_attempts: 0 },
    { totalAttempts: 99, hasActiveAttempt: false }
  );
  assert(r.canCreateNew === true && r.maxAttempts === null, 'unlimited max_attempts when <= 0');
}

expectThrow(
  () =>
    assertCanCreateNewTestAttempt(
      { id: 1, max_attempts: 1 },
      { totalAttempts: 1, hasActiveAttempt: false }
    ),
  ApiError,
  'assertCanCreateNewTestAttempt throws when max attempts reached'
);

try {
  assertCanCreateNewTestAttempt(
    { id: 1, max_attempts: 3 },
    { totalAttempts: 1, hasActiveAttempt: false }
  );
  passed += 1;
  console.log('  ✓ assertCanCreateNewTestAttempt allows when under max');
} catch {
  failed += 1;
  console.error('  ✗ assertCanCreateNewTestAttempt allows when under max');
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
