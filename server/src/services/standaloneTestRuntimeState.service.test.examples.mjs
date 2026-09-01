/**
 * Standalone open/close + schedule decision matrix.
 * Run: node src/services/standaloneTestRuntimeState.service.test.examples.mjs
 */
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  STANDALONE_ACTIVE_CATALOG_WHERE_SQL,
  STANDALONE_LISTING_STATUS,
  assertStandaloneActiveCatalogAccess,
  evaluateStandaloneRuntimeState,
} from './standaloneTestRuntimeState.service.js';
import {
  assertTestAvailabilityWindow,
  AVAILABILITY_PHASE,
  evaluateTestAvailabilityWindow,
} from './testAvailabilityWindow.service.js';
import { TEST_AVAILABILITY_CREATE_WHERE_SQL } from './testAvailabilityWindow.queries.js';
import { TestNotAccessibleError } from '../errors/testAttempt/TestAttemptErrors.js';
import { computeEligiblePrepCanStart, evaluateRetakePolicy } from './testRetakePolicy.service.js';
import { shouldEnforceScheduleWindow } from '../security/cee/courseLinkedTestAccess.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.join(__dirname, '..', '..');

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

const now = Date.parse('2026-09-02T10:00:00.000Z');
const start = '2026-09-02T09:00:00.000Z';
const end = '2026-09-02T14:00:00.000Z';
const before = Date.parse('2026-09-02T08:00:00.000Z');
const after = Date.parse('2026-09-02T15:00:00.000Z');
const retake = evaluateRetakePolicy({ max_attempts: 1 }, { totalAttempts: 0, hasActiveAttempt: false });

function row(overrides = {}) {
  return {
    id: 41,
    public_slug: 'bio-test',
    status: 'published',
    access_mode: 'public',
    test_access_type: 'free_standalone',
    deleted_at: null,
    start_date: start,
    end_date: end,
    ...overrides,
  };
}

function canStart(testRow, nowMs, extra = {}) {
  const runtime = evaluateStandaloneRuntimeState(testRow, nowMs);
  return computeEligiblePrepCanStart({
    examOpen: runtime.examOpen,
    availability: runtime.availability,
    retake: extra.retake || retake,
    hasActiveAttempt: Boolean(extra.hasActiveAttempt),
  });
}

console.log('standalone open/close + schedule decision matrix\n');

{
  const runtime = evaluateStandaloneRuntimeState(row({ access_mode: 'private' }), before);
  ok('1. CLOSED + before start is visible', runtime.listedInActiveCatalog === true);
  ok('1. CLOSED + before start cannot start', canStart(row({ access_mode: 'private' }), before) === false);
  ok('1. CLOSED + before start status is CLOSED', runtime.listingStatus === STANDALONE_LISTING_STATUS.CLOSED);
}

{
  const runtime = evaluateStandaloneRuntimeState(row(), before);
  ok('2. OPEN + before start is visible', runtime.listedInActiveCatalog === true);
  ok('2. OPEN + before start cannot start', canStart(row(), before) === false);
  ok('2. OPEN + before start status is UPCOMING', runtime.listingStatus === STANDALONE_LISTING_STATUS.UPCOMING);
}

{
  const runtime = evaluateStandaloneRuntimeState(row(), now);
  ok('3. OPEN + during window is visible', runtime.listedInActiveCatalog === true);
  ok('3. OPEN + during window can start', canStart(row(), now) === true);
  ok('3. OPEN + during window status is LIVE', runtime.listingStatus === STANDALONE_LISTING_STATUS.LIVE);
}

{
  const closedLive = row({ access_mode: 'private' });
  const runtime = evaluateStandaloneRuntimeState(closedLive, now);
  ok('4. CLOSED + during window is visible', runtime.listedInActiveCatalog === true);
  ok('4. CLOSED + during window cannot start', canStart(closedLive, now) === false);
  ok('4. CLOSED + during window status is CLOSED', runtime.listingStatus === STANDALONE_LISTING_STATUS.CLOSED);
}

{
  const runtime = evaluateStandaloneRuntimeState(row(), after);
  ok('5. OPEN + after end not in active list', runtime.listedInActiveCatalog === false);
  ok('5. OPEN + after end cannot start', canStart(row(), after) === false);
  ok('5. OPEN + after end status is EXPIRED', runtime.listingStatus === STANDALONE_LISTING_STATUS.EXPIRED);
}

{
  const closedEnded = row({ access_mode: 'private' });
  const runtime = evaluateStandaloneRuntimeState(closedEnded, after);
  ok('6. CLOSED + after end not in active list', runtime.listedInActiveCatalog === false);
  ok('6. CLOSED + after end cannot start', canStart(closedEnded, after) === false);
  ok('6. CLOSED + after end status is EXPIRED', runtime.listingStatus === STANDALONE_LISTING_STATUS.EXPIRED);
}

ok(
  '7. SQL active catalog excludes expired tests and does not require Open',
  STANDALONE_ACTIVE_CATALOG_WHERE_SQL.includes('end_date > UTC_TIMESTAMP()') &&
    !STANDALONE_ACTIVE_CATALOG_WHERE_SQL.includes("access_mode = 'public'")
);

{
  let denied = false;
  try {
    assertTestAvailabilityWindow(row(), {
      phase: AVAILABILITY_PHASE.CREATE_ATTEMPT,
      nowMs: after,
    });
  } catch (error) {
    denied = error instanceof TestNotAccessibleError && error.metadata?.reason === 'test_no_longer_available';
  }
  ok('8. CREATE_ATTEMPT after end is denied by availability window', denied);
}

ok(
  '9. completed results listing is attempt-based (not schedule-based)',
  readFileSync(path.join(serverRoot, 'src/services/standaloneMyTests.service.js'), 'utf8').includes(
    "a.status IN ('in_progress', 'submitted', 'expired')"
  ) &&
    !readFileSync(path.join(serverRoot, 'src/services/standaloneMyTests.service.js'), 'utf8').includes(
      'end_date > UTC_TIMESTAMP()'
    )
);

{
  const resume = evaluateRetakePolicy({ max_attempts: 1 }, { totalAttempts: 1, hasActiveAttempt: true });
ok(
  '10. in-progress attempt remains startable after end (resume path)',
  canStart(row(), after, { retake: resume, hasActiveAttempt: true }) === true
);
ok(
  '10. in-progress attempt remains startable when exam is closed',
  canStart(row({ access_mode: 'private' }), now, { retake: resume, hasActiveAttempt: true }) === true
);
  ok(
    '10. IN_PROGRESS after end allows attempt started before end',
    assertTestAvailabilityWindow(row(), {
      phase: AVAILABILITY_PHASE.IN_PROGRESS,
      nowMs: after,
      attemptStartedAt: start,
    }) === undefined
  );
}

{
  const paid = row({ test_access_type: 'paid_standalone', access_mode: 'public' });
  const runtime = evaluateStandaloneRuntimeState(paid, now);
  ok('11. paid OPEN + live is startable by schedule/open gates', runtime.canCreateAttemptByOpenAndWindow === true);
  ok(
    '11. paid CLOSED + live is not startable even if payment would be approved',
    evaluateStandaloneRuntimeState({ ...paid, access_mode: 'private' }, now).canCreateAttemptByOpenAndWindow === false
  );
  ok(
    '11. paid OPEN + before start is not startable',
    evaluateStandaloneRuntimeState(paid, before).canCreateAttemptByOpenAndWindow === false
  );
}

ok(
  '12. course-linked tests do not use standalone schedule gates',
  shouldEnforceScheduleWindow({ test_access_type: 'course_locked', course_id: 9 }) === false
);
ok(
  '12. course listing SQL is still enrollment/public, not end_date',
  readFileSync(path.join(serverRoot, 'src/services/studentTestListing.queries.js'), 'utf8').includes(
    'start_date / end_date are selected for display only'
  )
);

{
  const exactEnd = Date.parse(end);
  const snap = evaluateTestAvailabilityWindow(row(), exactEnd);
  ok('14. now === end_date is expired (UTC inclusive end)', snap.noLongerAvailable === true && snap.insideWindow === false);
  let denied = false;
  try {
    assertTestAvailabilityWindow(row(), { phase: AVAILABILITY_PHASE.CREATE_ATTEMPT, nowMs: exactEnd });
  } catch (error) {
    denied = error instanceof TestNotAccessibleError;
  }
  ok('14. CREATE_ATTEMPT at exact end_date is denied', denied);
}

ok(
  'INSERT SQL uses exclusive end (now >= end is expired)',
  TEST_AVAILABILITY_CREATE_WHERE_SQL.includes('t.end_date > UTC_TIMESTAMP()')
);

{
  let denied = false;
  try {
    assertStandaloneActiveCatalogAccess(row(), after, { slug: 'bio-test' });
  } catch (error) {
    denied = error instanceof TestNotAccessibleError && error.metadata?.reason === 'test_no_longer_available';
  }
  ok('expired catalog access helper rejects after end', denied);
}

ok(
  'free catalog uses active-catalog SQL (not access_mode public)',
  readFileSync(path.join(serverRoot, 'src/services/freeStandaloneCatalog.service.js'), 'utf8').includes(
    'STANDALONE_ACTIVE_CATALOG_WHERE_SQL'
  ) &&
    !readFileSync(path.join(serverRoot, 'src/services/freeStandaloneCatalog.service.js'), 'utf8').includes(
      "t.access_mode = 'public'"
    )
);
ok(
  'paid catalog uses active-catalog SQL (expired removed server-side)',
  readFileSync(path.join(serverRoot, 'src/services/paidStandaloneRegistration.service.js'), 'utf8').includes(
    'STANDALONE_ACTIVE_CATALOG_WHERE_SQL'
  )
);
ok(
  'paid registration re-checks availability window (payment cannot bypass schedule)',
  readFileSync(path.join(serverRoot, 'src/services/paidStandaloneRegistration.service.js'), 'utf8').includes(
    'registerPaidStandaloneTest'
  ) &&
    readFileSync(path.join(serverRoot, 'src/services/paidStandaloneRegistration.service.js'), 'utf8').includes(
      'assertTestAvailabilityWindowForTest'
    )
);

console.log(`\nPassed: ${passed}`);
console.log(`Failed: ${failed}`);
if (failed) process.exit(1);
