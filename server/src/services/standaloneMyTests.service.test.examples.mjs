/**
 * Standalone My Tests — status mapping and list filters (no DB).
 * Run: node src/services/standaloneMyTests.service.test.examples.mjs
 */
import {
  clampPageSize,
  deriveStandaloneAttemptState,
  mapStandaloneMyTestItem,
  normalizeAccessTypeFilter,
  normalizeSearchTerm,
  normalizeStatusFilter,
  buildStandaloneMyTestsFilterClauses,
  statusPresentation,
} from './standaloneMyTests.presentation.js';
import { STANDALONE_TEST_JOIN_SQL } from '../constants/testAccessType.constants.js';

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

console.log('standaloneMyTests.service\n');

assert(clampPageSize(0) === 10, 'invalid page size falls back to 10');
assert(clampPageSize(200) === 50, 'page size is capped at 50');
assert(normalizeAccessTypeFilter('FREE') === 'free', 'accessType free is accepted');
assert(normalizeAccessTypeFilter('paid') === 'paid', 'accessType paid is accepted');
assert(normalizeAccessTypeFilter('course') === 'all', 'unknown accessType becomes all');
assert(normalizeStatusFilter('pending') === 'pending', 'pending status filter is accepted');
assert(normalizeStatusFilter('published') === 'published', 'published status filter is accepted');
assert(normalizeStatusFilter('hack') === 'all', 'unknown status becomes all');
assert(normalizeSearchTerm('  Biology  ').length === 7, 'search is trimmed');
assert(
  STANDALONE_TEST_JOIN_SQL.includes('course_id IS NULL'),
  'My Results SQL join excludes course-linked tests'
);
assert(
  STANDALONE_TEST_JOIN_SQL.includes('free_standalone') && STANDALONE_TEST_JOIN_SQL.includes('paid_standalone'),
  'My Results SQL join is free + paid standalone only'
);

{
  const all = buildStandaloneMyTestsFilterClauses({ search: '', accessType: 'all', status: 'all' });
  assert(
    all.extraWhere.includes("a.status IN ('submitted', 'expired')"),
    'default all filter is completed attempts only'
  );
  assert(!all.extraWhere.includes('in_progress'), 'default all does not treat in-progress as a completed result');
}
{
  const inProgress = buildStandaloneMyTestsFilterClauses({ search: '', accessType: 'all', status: 'in_progress' });
  assert(inProgress.extraWhere.includes("a.status = 'in_progress'"), 'in-progress is an explicit recovery filter');
}
{
  const published = buildStandaloneMyTestsFilterClauses({ search: '', accessType: 'all', status: 'published' });
  assert(published.extraWhere.includes("a.status IN ('submitted', 'expired')"), 'published filter is completed');
  assert(published.extraWhere.includes('results_released_at'), 'published filter requires release');
}
{
  const free = buildStandaloneMyTestsFilterClauses({ search: '', accessType: 'free', status: 'all' });
  assert(free.params.includes('free_standalone'), 'free filter uses free_standalone');
  assert(!free.extraWhere.includes('course_locked'), 'free filter does not query course-linked tests');
}
{
  const paid = buildStandaloneMyTestsFilterClauses({ search: '', accessType: 'paid', status: 'all' });
  assert(paid.params.includes('paid_standalone'), 'paid filter uses paid_standalone');
}

assert(
  deriveStandaloneAttemptState({ attemptStatus: 'in_progress' }) === 'in_progress',
  'in-progress attempts stay in progress'
);
assert(
  deriveStandaloneAttemptState({ attemptStatus: 'submitted', resultAvailable: true }) === 'published',
  'visible submitted results are published'
);
assert(
  deriveStandaloneAttemptState({ attemptStatus: 'submitted', resultAvailable: false }) === 'pending',
  'withheld submitted results are pending'
);
assert(
  deriveStandaloneAttemptState({
    attemptStatus: 'submitted',
    resultAvailable: true,
    integrityBlocked: true,
  }) === 'blocked',
  'integrity block wins over published scores'
);
assert(
  deriveStandaloneAttemptState({ attemptStatus: 'in_progress', flagged: true }) === 'blocked',
  'flagged attempts are blocked'
);

{
  const withheld = mapStandaloneMyTestItem({
    attempt_id: 11,
    test_id: 22,
    attempt_status: 'submitted',
    started_at: '2026-08-30T10:00:00.000Z',
    submitted_at: '2026-08-30T11:00:00.000Z',
    completion_reason: 'submitted',
    is_flagged_cheating: 0,
    attempt_time_taken_seconds: 1800,
    test_title: 'Biology 200 MCQs',
    public_slug: 'biology-200',
    test_access_type: 'free_standalone',
    results_released_at: null,
    show_result_immediately: 0,
    score: 16,
    max_score: 20,
    percentage: 80,
    correct_count: 16,
    wrong_count: 4,
    result_time_taken_seconds: 1800,
    pass_status: 'PASS',
    integrity_blocked_at: null,
  });
  assert(withheld.state === 'pending', 'pending mapper withholds result state');
  assert(withheld.score == null && withheld.percentage == null, 'pending mapper hides marks');
  assert(withheld.correctCount == null && withheld.incorrectCount == null, 'pending mapper hides counts');
  assert(withheld.accessType === 'free_standalone', 'mapper keeps standalone access type');
  assert(withheld.ctaLabel === 'View Status', 'pending CTA is View Status');
  assert(withheld.statusLabel === 'Results Pending', 'pending status label is Results Pending');
  assert(withheld.testId == null, 'list payload does not advertise internal test ids');
}

{
  const published = mapStandaloneMyTestItem({
    attempt_id: 12,
    test_id: 22,
    attempt_status: 'submitted',
    started_at: '2026-08-30T10:00:00.000Z',
    submitted_at: '2026-08-30T11:00:00.000Z',
    completion_reason: 'submitted',
    is_flagged_cheating: 0,
    attempt_time_taken_seconds: 1800,
    test_title: 'Biology 200 MCQs',
    public_slug: 'biology-200',
    test_access_type: 'paid_standalone',
    results_released_at: '2026-08-31T00:00:00.000Z',
    show_result_immediately: 0,
    score: 16,
    max_score: 20,
    percentage: 80,
    correct_count: 16,
    wrong_count: 4,
    result_time_taken_seconds: 1800,
    pass_status: 'PASS',
    integrity_blocked_at: null,
  });
  assert(published.state === 'published', 'released results are published');
  assert(published.score === 16 && published.maxScore === 20, 'published mapper returns score');
  assert(published.percentage === 80, 'published mapper returns percentage');
  assert(published.correctCount === 16 && published.incorrectCount === 4, 'published mapper returns counts');
  assert(published.ctaLabel === 'View Details', 'published CTA is View Details');
  assert(published.statusLabel === 'Result Published', 'published status label is Result Published');
  assert(statusPresentation('published').ctaLabel === 'View Details', 'status helper uses View Details');
}

{
  const blocked = mapStandaloneMyTestItem({
    attempt_id: 13,
    test_id: 22,
    attempt_status: 'submitted',
    started_at: '2026-08-30T10:00:00.000Z',
    submitted_at: '2026-08-30T11:00:00.000Z',
    completion_reason: 'submitted',
    is_flagged_cheating: 0,
    attempt_time_taken_seconds: 90,
    test_title: 'Biology 200 MCQs',
    public_slug: 'biology-200',
    test_access_type: 'free_standalone',
    results_released_at: '2026-08-31T00:00:00.000Z',
    show_result_immediately: 1,
    score: 2,
    max_score: 20,
    percentage: 10,
    correct_count: 2,
    wrong_count: 18,
    result_time_taken_seconds: 90,
    pass_status: 'FAIL',
    integrity_blocked_at: '2026-08-30T10:12:00.000Z',
  });
  assert(blocked.state === 'blocked', 'integrity block maps to blocked');
  assert(blocked.score == null, 'blocked mapper does not advertise a published score');
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
