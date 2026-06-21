/**
 * G-RT-03 — test availability window unit tests.
 *
 * Run: npm run test:availability-window
 */
import {
  assertTestAvailabilityWindow,
  AVAILABILITY_PHASE,
  evaluateTestAvailabilityWindow,
  formatAvailabilityMetadataIso,
  parseTestAvailabilityInstant,
  toAvailabilityIso,
} from './testAvailabilityWindow.service.js';
import { TestNotAccessibleError } from '../errors/testAttempt/TestAttemptErrors.js';

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

function expectThrowMetadata(fn, ErrorType, message, metadataChecks) {
  try {
    fn();
    failed += 1;
    console.error(`  ✗ ${message} (no throw)`);
  } catch (error) {
    if (!(error instanceof ErrorType)) {
      failed += 1;
      console.error(`  ✗ ${message} (wrong error)`, error);
      return;
    }

    const metadata = error.metadata ?? {};
    const checksOk = Object.entries(metadataChecks).every(([key, expected]) => {
      if (typeof expected === 'function') {
        return expected(metadata[key], metadata);
      }
      return metadata[key] === expected;
    });

    if (checksOk) {
      passed += 1;
      console.log(`  ✓ ${message}`);
    } else {
      failed += 1;
      console.error(`  ✗ ${message} (metadata mismatch)`, metadata);
    }
  }
}

console.log('testAvailabilityWindow.service — G-RT-03\n');

expectThrow(
  () =>
    assertTestAvailabilityWindow(
      { id: 1, start_date: '2099-01-01T00:00:00.000Z', end_date: null },
      { phase: AVAILABILITY_PHASE.ANY_ACCESS }
    ),
  TypeError,
  'assertTestAvailabilityWindow requires explicit nowMs'
);

expectThrow(
  () => evaluateTestAvailabilityWindow({ id: 1, start_date: null, end_date: null }),
  TypeError,
  'evaluateTestAvailabilityWindow requires explicit nowMs'
);

{
  const ms = parseTestAvailabilityInstant('2026-06-15 10:30:00');
  assert(typeof ms === 'number' && ms > 0, 'MySQL DATETIME parsed as UTC');
}

{
  const ms = parseTestAvailabilityInstant('2026-06-15T10:30:00.000Z');
  assert(ms === Date.parse('2026-06-15T10:30:00.000Z'), 'ISO Z parsed');
}

expectThrow(
  () =>
    assertTestAvailabilityWindow(
      { id: 1, start_date: '2099-01-01T00:00:00.000Z', end_date: null },
      { phase: AVAILABILITY_PHASE.ANY_ACCESS, nowMs: Date.parse('2026-01-01T00:00:00.000Z') }
    ),
  TestNotAccessibleError,
  'ANY_ACCESS blocks before start_date'
);

expectThrow(
  () =>
    assertTestAvailabilityWindow(
      { id: 1, start_date: null, end_date: '2020-01-01T00:00:00.000Z' },
      { phase: AVAILABILITY_PHASE.CREATE_ATTEMPT, nowMs: Date.parse('2026-01-01T00:00:00.000Z') }
    ),
  TestNotAccessibleError,
  'CREATE_ATTEMPT blocks after end_date'
);

assert(
  assertTestAvailabilityWindow(
    { id: 1, start_date: '2020-01-01T00:00:00.000Z', end_date: '2099-01-01T00:00:00.000Z' },
    { phase: AVAILABILITY_PHASE.CREATE_ATTEMPT, nowMs: Date.parse('2026-06-01T00:00:00.000Z') }
  ) === undefined,
  'CREATE_ATTEMPT allows within window'
);

expectThrow(
  () =>
    assertTestAvailabilityWindow(
      {
        id: 1,
        start_date: '2020-01-01T00:00:00.000Z',
        end_date: '2026-06-10T12:00:00.000Z',
      },
      {
        phase: AVAILABILITY_PHASE.IN_PROGRESS,
        nowMs: Date.parse('2026-06-11T00:00:00.000Z'),
        attemptStartedAt: '2026-06-11T01:00:00.000Z',
      }
    ),
  TestNotAccessibleError,
  'IN_PROGRESS after end blocks attempt started after end'
);

assert(
  assertTestAvailabilityWindow(
    {
      id: 1,
      start_date: '2020-01-01T00:00:00.000Z',
      end_date: '2026-06-10T12:00:00.000Z',
    },
    {
      phase: AVAILABILITY_PHASE.IN_PROGRESS,
      nowMs: Date.parse('2026-06-11T00:00:00.000Z'),
      attemptStartedAt: '2026-06-10T11:00:00.000Z',
    }
  ) === undefined,
  'IN_PROGRESS after end allows attempt started before end (grace until timer expiry)'
);

{
  const snap = evaluateTestAvailabilityWindow(
    { id: 5, start_date: '2099-01-01T00:00:00.000Z', end_date: null },
    Date.parse('2026-01-01T00:00:00.000Z')
  );
  assert(snap.notYetAvailable === true && snap.canCreateAttempt === false, 'evaluate — not yet available');
}

{
  const snap = evaluateTestAvailabilityWindow(
    { id: 5, start_date: null, end_date: '2020-01-01T00:00:00.000Z' },
    Date.parse('2026-01-01T00:00:00.000Z')
  );
  assert(snap.noLongerAvailable === true && snap.canCreateAttempt === false, 'evaluate — past end');
}

{
  const startMs = parseTestAvailabilityInstant('2026-06-12 19:42:00');
  assert(
    formatAvailabilityMetadataIso(startMs) === '2026-06-12T19:42:00.000Z',
    'formatAvailabilityMetadataIso — MySQL DATETIME to ISO'
  );
  assert(
    toAvailabilityIso(startMs) === '2026-06-12T19:42:00.000Z',
    'toAvailabilityIso — accepts parsed epoch ms'
  );
}

expectThrowMetadata(
  () =>
    assertTestAvailabilityWindow(
      { id: 14, start_date: '2026-06-12 19:42:00', end_date: null },
      { phase: AVAILABILITY_PHASE.ANY_ACCESS, nowMs: Date.parse('2026-06-12T19:24:00.000Z') }
    ),
  TestNotAccessibleError,
  'test_not_yet_available metadata includes startDate ISO',
  {
    reason: 'test_not_yet_available',
    startDate: '2026-06-12T19:42:00.000Z',
  }
);

expectThrowMetadata(
  () =>
    assertTestAvailabilityWindow(
      { id: 1, start_date: null, end_date: '2026-06-12 12:00:00' },
      { phase: AVAILABILITY_PHASE.CREATE_ATTEMPT, nowMs: Date.parse('2026-06-13T00:00:00.000Z') }
    ),
  TestNotAccessibleError,
  'test_no_longer_available metadata includes endDate ISO (CREATE_ATTEMPT)',
  {
    reason: 'test_no_longer_available',
    endDate: '2026-06-12T12:00:00.000Z',
  }
);

expectThrowMetadata(
  () =>
    assertTestAvailabilityWindow(
      {
        id: 1,
        start_date: '2020-01-01T00:00:00.000Z',
        end_date: '2026-06-10T12:00:00.000Z',
      },
      {
        phase: AVAILABILITY_PHASE.IN_PROGRESS,
        nowMs: Date.parse('2026-06-11T00:00:00.000Z'),
        attemptStartedAt: '2026-06-11T01:00:00.000Z',
      }
    ),
  TestNotAccessibleError,
  'test_no_longer_available metadata includes endDate ISO (IN_PROGRESS)',
  {
    reason: 'test_no_longer_available',
    endDate: '2026-06-10T12:00:00.000Z',
    attemptStartedAt: '2026-06-11T01:00:00.000Z',
  }
);

expectThrowMetadata(
  () =>
    assertTestAvailabilityWindow(
      {
        id: 1,
        start_date: '2020-01-01T00:00:00.000Z',
        end_date: '2026-06-10T12:00:00.000Z',
      },
      {
        phase: AVAILABILITY_PHASE.IN_PROGRESS,
        nowMs: Date.parse('2026-06-11T00:00:00.000Z'),
        attemptStartedAt: null,
      }
    ),
  TestNotAccessibleError,
  'IN_PROGRESS after end with missing attemptStartedAt keeps endDate and null attemptStartedAt',
  {
    reason: 'test_no_longer_available',
    endDate: '2026-06-10T12:00:00.000Z',
    attemptStartedAt: null,
  }
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
