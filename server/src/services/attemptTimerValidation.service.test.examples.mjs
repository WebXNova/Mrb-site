/**
 * Unit test examples for attemptTimerValidation.service.js
 *
 * Run:
 *   node src/services/attemptTimerValidation.service.test.examples.mjs
 */

import { validateAttemptTimer } from './attemptTimerValidation.service.js';
import { AttemptExpiredStateError, AttemptInvalidStateError } from '../errors/testAttempt/TestAttemptErrors.js';

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

console.log('attemptTimerValidation.service — unit test examples\n');

// Should throw on expired attempt and flip status when markExpired=true.
{
  const nowMs = Date.parse('2026-01-02T00:00:00.000Z');
  const attemptRow = { status: 'in_progress', expires_at: '2026-01-01T00:00:00.000Z' };

  const executor = {
    query: async () => [{ affectedRows: 1 }],
  };

  try {
    await validateAttemptTimer(123, { attemptRow, nowMs, executor, markExpired: true });
    failed += 1;
    console.error('  ✗ expired attempt throws (no throw)');
  } catch (err) {
    assert(err instanceof AttemptExpiredStateError, 'expired attempt throws AttemptExpiredStateError');
  }
}

// Should throw even if markExpired=false (no DB update).
{
  const nowMs = Date.parse('2026-01-02T00:00:00.000Z');
  const attemptRow = { status: 'in_progress', expires_at: '2026-01-01T00:00:00.000Z' };

  const executor = {
    query: async () => {
      throw new Error('DB update should not run when markExpired=false');
    },
  };

  try {
    await validateAttemptTimer(123, { attemptRow, nowMs, executor, markExpired: false });
    failed += 1;
    console.error('  ✗ expired attempt throws when markExpired=false (no throw)');
  } catch (err) {
    assert(err instanceof AttemptExpiredStateError, 'expired attempt throws even when markExpired=false');
  }
}

// Status not in_progress should throw AttemptInvalidStateError.
{
  const attemptRow = { status: 'completed', expires_at: '2099-01-01T00:00:00.000Z' };
  try {
    await validateAttemptTimer(1, { attemptRow, nowMs: Date.now(), executor: null, markExpired: false });
    failed += 1;
    console.error('  ✗ completed attempt throws (no throw)');
  } catch (err) {
    assert(err instanceof AttemptInvalidStateError, 'non in_progress attempt throws AttemptInvalidStateError');
  }
}

// Future expiry should pass.
{
  const nowMs = Date.parse('2026-01-01T00:00:00.000Z');
  const attemptRow = { status: 'in_progress', expires_at: '2099-01-01T00:00:00.000Z' };
  await validateAttemptTimer(1, { attemptRow, nowMs, executor: null, markExpired: false });
  assert(true, 'future expiry passes');
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;

