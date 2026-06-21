/**
 * A4 quiz draft recovery — acceptance tests.
 *
 * Run: npm run test:quiz-draft-recovery
 */
import {
  detectUnsyncedLocalBackup,
  formatRecoveryBannerMessage,
  resolveQuizDraftRecovery,
} from './quizDraftRecovery.js';

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

const q1 = [
  {
    id: 'q1',
    title: '',
    questionText: 'A',
    points: 1,
    questionType: 'multiple_choice',
    collapsed: false,
    showExplanation: false,
    explanation: '',
    choices: [
      { id: 'c1', text: 'x', isCorrect: true },
      { id: 'c2', text: 'y', isCorrect: false },
    ],
  },
];
const q2 = [
  {
    id: 'q2',
    title: '',
    questionText: 'B-edited',
    points: 2,
    questionType: 'multiple_choice',
    collapsed: false,
    showExplanation: false,
    explanation: '',
    choices: [
      { id: 'c3', text: 'x', isCorrect: true },
      { id: 'c4', text: 'y', isCorrect: false },
    ],
  },
];

console.log('quizDraftRecovery — A4');

ok(
  'pending same version is unsynced',
  detectUnsyncedLocalBackup(
    { questions: q2, syncState: 'pending', serverVersion: 3, savedAt: '2026-06-07T12:00:00.000Z' },
    { version: 3, questions: q1, savedAt: '2026-06-07T10:00:00.000Z' }
  ).unsynced === true
);

ok(
  'stale local version not unsynced',
  detectUnsyncedLocalBackup(
    { questions: q2, syncState: 'pending', serverVersion: 2, savedAt: '2026-06-07T12:00:00.000Z' },
    { version: 5, questions: q1, savedAt: '2026-06-07T10:00:00.000Z' }
  ).unsynced === false
);

const serverWins = resolveQuizDraftRecovery({
  hasServerDraft: true,
  server: { questions: q1, savedAt: '2026-06-07T10:00:00.000Z', version: 3 },
  local: { questions: q2, savedAt: '2026-06-07T11:00:00.000Z', serverVersion: 3, syncState: 'synced' },
});
ok('synced server wins', serverWins.source === 'server' && serverWins.questions === q1);

const unsyncedRecovery = resolveQuizDraftRecovery({
  hasServerDraft: true,
  server: { questions: q1, savedAt: '2026-06-07T10:00:00.000Z', version: 3 },
  local: {
    questions: q2,
    savedAt: '2026-06-07T12:00:00.000Z',
    serverVersion: 3,
    syncState: 'pending',
  },
});
ok('unsynced local recovered', unsyncedRecovery.source === 'local_unsynced');
ok('unsynced marks dirty', unsyncedRecovery.markDirty === true);
ok('unsynced needs sync', unsyncedRecovery.needsSync === true);

const networkFallback = resolveQuizDraftRecovery({
  hasServerDraft: false,
  server: null,
  local: { questions: q2, savedAt: '2026-06-07T11:00:00.000Z', syncState: 'pending' },
  serverUnavailable: true,
});
ok('network uses local', networkFallback.source === 'local' && networkFallback.fallbackReason === 'network');

const emptyNetwork = resolveQuizDraftRecovery({
  hasServerDraft: false,
  server: null,
  local: null,
  serverUnavailable: true,
});
ok('network no local → empty', emptyNetwork.source === 'empty');

ok(
  'banner for unsynced',
  formatRecoveryBannerMessage(unsyncedRecovery).includes('unsaved edits')
);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
