/**
 * Unit tests for attempt timing helpers.
 *
 * Run: node src/services/attemptTiming.service.test.examples.mjs
 */

import {
  assertValidTestDurationMinutes,
  parseMySqlDateTimeToMs,
} from './attemptTiming.service.js';
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

console.log('attemptTiming.service — unit test examples\n');

assert(assertValidTestDurationMinutes(30) === 30, 'accepts valid duration');
assert(assertValidTestDurationMinutes('60') === 60, 'coerces numeric string duration');

for (const bad of [0, -1, null, undefined, 1.5, NaN]) {
  try {
    assertValidTestDurationMinutes(bad);
    failed += 1;
    console.error(`  ✗ rejects invalid duration: ${String(bad)}`);
  } catch (error) {
    assert(error instanceof ApiError, `rejects invalid duration: ${String(bad)}`);
  }
}

{
  const local = '2026-06-05 13:06:11';
  const later = '2026-06-05 13:36:11';
  assert(
    parseMySqlDateTimeToMs(later) > parseMySqlDateTimeToMs(local),
    'mysql local datetime comparison preserves order'
  );
}

{
  const started = parseMySqlDateTimeToMs('2026-06-05 13:06:11');
  const expires = parseMySqlDateTimeToMs('2026-06-05 08:39:10');
  assert(expires < started, 'detects corrupted expires_before_started rows');
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
