/**
 * Unit checks for attempt session core (no DB).
 * Run: node src/attempt/attempt.service.test.examples.mjs
 */
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { toApiAttemptStatus, ATTEMPT_DB_STATUS } from './attempt.constants.js';
import { assertAttemptTokenMatches, parsePositiveInt, studentOwnsAttemptRow } from './attempt.util.js';
import { AttemptTokenInvalidError } from '../errors/testAttempt/TestAttemptErrors.js';

let passed = 0;
let failed = 0;

function ok(label, condition) {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${label}`);
  }
}

console.log('attemptCore — unit examples\n');

ok('maps in_progress → active', toApiAttemptStatus(ATTEMPT_DB_STATUS.ACTIVE) === 'active');
ok('parsePositiveInt rejects zero', parsePositiveInt(0) === null);
ok('ownership via student_id', studentOwnsAttemptRow({ student_id: 5, user_id: null }, 5));
ok('ownership via user_id legacy', studentOwnsAttemptRow({ student_id: 5, user_id: 5 }, 5));
ok('ownership denies stranger', !studentOwnsAttemptRow({ student_id: 5 }, 9));

try {
  assertAttemptTokenMatches('secret-token', 'wrong');
  failed += 1;
  console.error('  ✗ token mismatch should throw');
} catch (error) {
  ok('token mismatch throws', error instanceof AttemptTokenInvalidError);
}

const token = crypto.randomUUID();
assertAttemptTokenMatches(token, token);
passed += 1;
console.log('  ✓ token match accepts valid bearer');

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
