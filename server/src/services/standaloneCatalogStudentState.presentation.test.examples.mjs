/**
 * Per-student catalog CTA (no DB).
 * Run: node src/services/standaloneCatalogStudentState.presentation.test.examples.mjs
 */
import { evaluateRetakePolicy } from './testRetakePolicy.service.js';
import {
  deriveStandaloneCatalogStudentAction,
  mapStandaloneCatalogStudentState,
} from './standaloneCatalogStudentState.presentation.js';

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

console.log('standaloneCatalogStudentState.presentation\n');

{
  const exhausted = evaluateRetakePolicy({ max_attempts: 1 }, { totalAttempts: 1, hasActiveAttempt: false });
  assert(exhausted.canCreateNew === false, 'existing retake policy blocks a second attempt at max 1');
  const action = deriveStandaloneCatalogStudentAction({
    kind: 'free',
    hasActiveAttempt: false,
    hasCompletedAttempt: true,
    canResumeActive: exhausted.canResumeActive,
    canCreateNew: exhausted.canCreateNew,
    catalogOpen: true,
    resultVisible: true,
  });
  assert(action.action === 'view_details', 'completed free test with no retake is View Details, not Start Test');
  assert(action.ctaLabel === 'View Details', 'completed CTA is View Details');
}

{
  const exhausted = evaluateRetakePolicy({ max_attempts: 1 }, { totalAttempts: 1, hasActiveAttempt: false });
  const action = deriveStandaloneCatalogStudentAction({
    kind: 'paid',
    hasActiveAttempt: false,
    hasCompletedAttempt: true,
    canResumeActive: exhausted.canResumeActive,
    canCreateNew: exhausted.canCreateNew,
    catalogOpen: true,
    resultVisible: true,
  });
  assert(action.action === 'view_details', 'completed paid test with no retake is not Register for Test');
  assert(action.ctaLabel !== 'Register for Test', 'paid exhausted CTA is not a fresh registration');
}

{
  const retake = evaluateRetakePolicy({ max_attempts: 3 }, { totalAttempts: 2, hasActiveAttempt: false });
  assert(retake.canCreateNew === true, 'retake remains allowed before max attempts');
  const action = deriveStandaloneCatalogStudentAction({
    kind: 'free',
    hasActiveAttempt: false,
    hasCompletedAttempt: true,
    canResumeActive: retake.canResumeActive,
    canCreateNew: retake.canCreateNew,
    catalogOpen: true,
    resultVisible: true,
  });
  assert(action.action === 'start', 'completed free test still offers Start Test when retakes remain');
}

{
  const action = deriveStandaloneCatalogStudentAction({
    kind: 'free',
    hasActiveAttempt: true,
    hasCompletedAttempt: false,
    canResumeActive: true,
    canCreateNew: false,
    catalogOpen: true,
    resultVisible: false,
  });
  assert(action.action === 'continue', 'in-progress attempt is Continue Test, not a completed result');
}

{
  const action = deriveStandaloneCatalogStudentAction({
    kind: 'paid',
    hasActiveAttempt: false,
    hasCompletedAttempt: true,
    canResumeActive: false,
    canCreateNew: false,
    catalogOpen: true,
    resultVisible: false,
  });
  assert(action.action === 'view_status', 'unpublished completed result is View Status');
  assert(action.ctaLabel === 'View Status', 'pending CTA is View Status');
}

{
  const guestOpen = deriveStandaloneCatalogStudentAction({
    kind: 'paid',
    hasActiveAttempt: false,
    hasCompletedAttempt: false,
    canResumeActive: false,
    canCreateNew: true,
    catalogOpen: true,
    resultVisible: false,
  });
  assert(guestOpen.action === 'register', 'another student still sees Register for Test');
}

{
  const mapped = mapStandaloneCatalogStudentState({
    kind: 'free',
    item: { examOpen: true, slug: 'bio' },
    row: {
      max_attempts: 1,
      seat_capacity: 0,
      occupied_seats: 0,
      results_released_at: '2026-08-31T00:00:00.000Z',
      show_result_immediately: 0,
    },
    stats: {
      totalAttempts: 1,
      hasActiveAttempt: false,
      hasCompletedAttempt: true,
      activeAttemptId: null,
      latestCompletedAttemptId: 44,
    },
  });
  assert(mapped.attemptId === 44, 'view details uses the student own completed attempt id');
  assert(mapped.canCreateNew === false, 'mapper uses existing retake evaluation');
  assert(mapped.action === 'view_details', 'mapper marks exhausted completed tests as view details');
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
