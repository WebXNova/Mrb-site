/**
 * UTC datetime standard — unit tests.
 *
 * Run: node src/utils/utcDateTime.test.examples.mjs
 */
import { formatMySqlDateTime } from './dateTime.js';
import {
  parseUtcMySqlInstant,
  serializeUtcMySqlDateTime,
  utcInstantToIso,
} from './utcDateTime.js';
import { parseMySqlDateTimeToMs } from '../services/attemptTiming.service.js';

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

console.log('utcDateTime — UTC standard\n');

{
  const iso = '2026-06-12T19:42:00.000Z';
  const stored = serializeUtcMySqlDateTime(iso);
  assert(stored === '2026-06-12 19:42:00', 'ISO Z serializes to UTC MySQL DATETIME wall');
  assert(utcInstantToIso(stored) === iso, 'round-trip stored → ISO');
}

{
  const ms = parseUtcMySqlInstant('2026-06-12 19:42:00');
  assert(ms === Date.parse('2026-06-12T19:42:00.000Z'), 'parseUtcMySqlInstant treats naive as UTC');
}

{
  const timerMs = parseMySqlDateTimeToMs('2026-06-12 19:42:00');
  const availMs = parseUtcMySqlInstant('2026-06-12 19:42:00');
  assert(timerMs === availMs, 'attempt timer and availability parsers agree on UTC naive DATETIME');
}

{
  const fromFormat = formatMySqlDateTime('2026-06-12T14:42:00.000Z');
  assert(fromFormat === '2026-06-12 14:42:00', 'formatMySqlDateTime uses UTC components');
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
