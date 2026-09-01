/**
 * Admin display copy for access types and access modes.
 * Run: node src/admin/utils/testAdminDisplay.test.examples.mjs
 */
import {
  formatSeatInventoryLine,
  getAccessModeOptionCopy,
  getStandaloneSeatSummary,
} from './testAdminDisplay.js';

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

console.log('testAdminDisplay — access copy and seats\n');

{
  const pub = getAccessModeOptionCopy('course_locked', 'public');
  assert(
    pub.hint.includes('only students actively enrolled in the assigned course can start/access the test'),
    'Course-linked public copy never implies open enrollment'
  );
  const priv = getAccessModeOptionCopy('course_locked', 'private');
  assert(priv.hint.toLowerCase().includes('administrators'), 'Course-linked private is admin-only');
}

{
  const seats = getStandaloneSeatSummary({ seatCapacity: 500, confirmedSeats: 327 });
  assert(seats.capacity === 500 && seats.confirmed === 327 && seats.remaining === 173, 'Seat remaining math');
  assert(
    formatSeatInventoryLine({ seat_capacity: 500, confirmed_seats: 327 }).includes('173 remaining'),
    'Seat inventory line includes remaining'
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
