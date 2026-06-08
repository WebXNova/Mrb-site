/**
 * Unit-style checks for createEntitledTestAttempt validation (no DB).
 */
import assert from 'node:assert/strict';
import {
  assertStudentIdForAttemptInsert,
  createEntitledTestAttempt,
} from './testAttempt.service.js';
import { ApiError } from '../utils/apiError.js';
import { EntitlementRequiredError } from '../errors/testAttempt/TestAttemptErrors.js';

let passed = 0;
let failed = 0;

async function expectRejects(label, fn, ErrorClass, messageIncludes) {
  try {
    await fn();
    failed += 1;
    console.error(`  ✗ ${label} — expected rejection`);
  } catch (error) {
    if (!(error instanceof ErrorClass)) {
      failed += 1;
      console.error(`  ✗ ${label} — wrong error type: ${error?.constructor?.name}`);
      return;
    }
    if (messageIncludes && !String(error.message).includes(messageIncludes)) {
      failed += 1;
      console.error(`  ✗ ${label} — message mismatch: ${error.message}`);
      return;
    }
    passed += 1;
    console.log(`  ✓ ${label}`);
  }
}

console.log('testAttempt.service validation examples\n');

await expectRejects(
  'rejects missing studentId',
  () => createEntitledTestAttempt({ slug: 'txt-4', studentId: 0, entitlement: { courseId: 1 } }),
  ApiError,
  'Missing authenticated student identity'
);

await expectRejects(
  'rejects missing slug',
  () => createEntitledTestAttempt({ slug: '', studentId: 42, entitlement: { courseId: 1 } }),
  ApiError,
  'Cannot create test attempt without test slug'
);

await expectRejects(
  'rejects missing entitlement',
  () => createEntitledTestAttempt({ slug: 'txt-4', studentId: 42, entitlement: null }),
  EntitlementRequiredError
);

try {
  assertStudentIdForAttemptInsert(null);
  failed += 1;
  console.error('  ✗ assertStudentIdForAttemptInsert should reject null');
} catch (error) {
  assert.equal(error.message, 'MISSING_STUDENT_ID');
  passed += 1;
  console.log('  ✓ assertStudentIdForAttemptInsert throws MISSING_STUDENT_ID');
}

assert.equal(typeof createEntitledTestAttempt, 'function');
passed += 1;
console.log('  ✓ createEntitledTestAttempt exported');

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
