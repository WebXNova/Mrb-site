/**
 * A1 quiz draft hydration priority — acceptance tests.
 *
 * Run: npm run test:quiz-draft-merge
 */
import { resolveQuizDraftHydrationSource } from './quizDraftMerge.js';
import { validateServerDraftHydrationResponse } from './quizDraftHydrationValidation.js';

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
    questionText: 'B',
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

console.log('quizDraftMerge — A1 server-first');

const serverRowExists = resolveQuizDraftHydrationSource({
  hasServerDraft: true,
  server: { questions: q1, savedAt: '2026-06-07T10:00:00.000Z', version: 2 },
  local: { questions: q2, savedAt: '2026-06-07T12:00:00.000Z' },
});
ok('server draft row beats newer local', serverRowExists.source === 'server' && serverRowExists.questions === q1);

const emptyServerRow = resolveQuizDraftHydrationSource({
  hasServerDraft: true,
  server: { questions: [], savedAt: '2026-06-07T10:00:00.000Z', version: 1 },
  local: { questions: q2, savedAt: '2026-06-07T12:00:00.000Z' },
});
ok('empty server draft row beats local', emptyServerRow.source === 'server' && emptyServerRow.questions.length === 0);

const localOnly = resolveQuizDraftHydrationSource({
  hasServerDraft: false,
  server: null,
  local: { questions: q2, savedAt: '2026-06-07T11:00:00.000Z' },
});
ok('no server draft → local', localOnly.source === 'local');

const empty = resolveQuizDraftHydrationSource({
  hasServerDraft: false,
  server: null,
  local: null,
});
ok('neither → empty', empty.source === 'empty' && empty.questions.length === 0);

console.log('\nquizDraftHydrationValidation');

const valid = validateServerDraftHydrationResponse(14, {
  testId: 14,
  draft: {
    draftId: 9,
    version: 2,
    draftPayload: {
      version: 1,
      testId: 14,
      questions: q1,
      totalPoints: 1,
      savedAt: '2026-06-07T10:00:00.000Z',
    },
  },
});
ok('valid server draft passes', valid.ok === true && valid.hasServerDraft === true && valid.questions.length === 1);

const noDraft = validateServerDraftHydrationResponse(14, { testId: 14, draft: null });
ok('null draft is no_draft', noDraft.ok === true && noDraft.hasServerDraft === false);

const mismatch = validateServerDraftHydrationResponse(14, {
  testId: 14,
  draft: {
    draftId: 9,
    version: 1,
    draftPayload: {
      version: 1,
      testId: 99,
      questions: q1,
      totalPoints: 1,
      savedAt: '2026-06-07T10:00:00.000Z',
    },
  },
});
ok('test id mismatch rejected', mismatch.ok === false && mismatch.code === 'test_id_mismatch');

const corrupt = validateServerDraftHydrationResponse(14, {
  testId: 14,
  draft: {
    draftId: 9,
    version: 1,
    draftPayload: {
      version: 1,
      testId: 14,
      questions: [{ id: 'bad' }],
      totalPoints: 1,
      savedAt: '2026-06-07T10:00:00.000Z',
    },
  },
});
ok('corrupt questions rejected', corrupt.ok === false && corrupt.code === 'corrupt_payload');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
