/**
 * A3 client conflict parsing — acceptance tests.
 *
 * Run: npm run test:quiz-draft-conflict
 */
import { DRAFT_VERSION_CONFLICT } from './quizDraftServerSave.js';
import { extractVersionConflictDetails, formatConflictMessage } from './quizDraftConflict.js';

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

console.log('quizDraftConflict — A3');

const conflict = extractVersionConflictDetails({
  status: 409,
  errorCode: DRAFT_VERSION_CONFLICT,
  details: {
    testId: 14,
    expectedVersion: 2,
    currentVersion: 3,
    lastModified: '2026-01-02T12:00:00.000Z',
    conflictKind: 'stale_version',
    draft: { version: 3, lastModified: '2026-01-02T12:00:00.000Z' },
  },
});

ok('parses conflict details', conflict?.currentVersion === 3);
ok('parses expected version', conflict?.expectedVersion === 2);
ok('parses conflict kind', conflict?.conflictKind === 'stale_version');

ok('stale message mentions version', formatConflictMessage(conflict).includes('out of date'));

const concurrentMessage = formatConflictMessage({
  testId: 14,
  expectedVersion: 3,
  currentVersion: 4,
  lastModified: null,
  conflictKind: 'concurrent_update',
  draft: null,
});
ok('concurrent message mentions another admin', concurrentMessage.includes('Another admin saved'));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
