/**
 * G-RT-05 — attempt delivery layout unit tests.
 *
 * Run: npm run test:delivery-layout
 */
import {
  applyAttemptDeliveryLayout,
  buildAttemptDeliveryLayout,
  deriveAttemptShuffleSeed,
  isShuffleEnabled,
  parseAttemptDeliveryLayout,
  serializeAttemptDeliveryLayout,
} from './attemptDeliveryLayout.service.js';
import { gradeComposedAttempt } from './testAttempt/gradeComposedAttempt.js';

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

const composedFixture = [
  {
    questionId: 1,
    questionText: 'Q1',
    marks: 1,
    displayOrder: 0,
    options: [
      { optionId: 11, optionText: 'A', isCorrect: false, sortOrder: 0 },
      { optionId: 12, optionText: 'B', isCorrect: true, sortOrder: 1 },
    ],
  },
  {
    questionId: 2,
    questionText: 'Q2',
    marks: 1,
    displayOrder: 1,
    options: [
      { optionId: 21, optionText: 'C', isCorrect: true, sortOrder: 0 },
      { optionId: 22, optionText: 'D', isCorrect: false, sortOrder: 1 },
    ],
  },
  {
    questionId: 3,
    questionText: 'Q3',
    marks: 1,
    displayOrder: 2,
    options: [
      { optionId: 31, optionText: 'E', isCorrect: false, sortOrder: 0 },
      { optionId: 32, optionText: 'F', isCorrect: true, sortOrder: 1 },
    ],
  },
];

console.log('attemptDeliveryLayout.service — G-RT-05\n');

assert(isShuffleEnabled(1) === true && isShuffleEnabled(0) === false, 'isShuffleEnabled');

{
  const seed = deriveAttemptShuffleSeed(42, 'nonce-abc');
  assert(seed === deriveAttemptShuffleSeed(42, 'nonce-abc'), 'seed deterministic for attempt');
  assert(seed !== deriveAttemptShuffleSeed(43, 'nonce-abc'), 'seed differs per attempt id');
}

{
  const layout = buildAttemptDeliveryLayout(composedFixture, {
    shuffleQuestions: false,
    shuffleOptions: false,
    seed: 123,
  });
  assert(
    layout.questionOrder.join(',') === '1,2,3',
    'no shuffle preserves canonical question order'
  );
  assert(
    layout.optionOrderByQuestion['1'].join(',') === '11,12',
    'no shuffle preserves canonical option order'
  );
}

{
  const seed = 999;
  const layoutA = buildAttemptDeliveryLayout(composedFixture, {
    shuffleQuestions: true,
    shuffleOptions: true,
    seed,
  });
  const layoutB = buildAttemptDeliveryLayout(composedFixture, {
    shuffleQuestions: true,
    shuffleOptions: true,
    seed,
  });
  assert(
    layoutA.questionOrder.join(',') === layoutB.questionOrder.join(','),
    'shuffle deterministic for same seed'
  );
  assert(
    layoutA.optionOrderByQuestion['1'].join(',') === layoutB.optionOrderByQuestion['1'].join(','),
    'option shuffle deterministic per question seed'
  );
  assert(
    [...layoutA.questionOrder].sort((a, b) => a - b).join(',') === '1,2,3',
    'shuffle produces valid question permutation'
  );
}

{
  const layout = buildAttemptDeliveryLayout(composedFixture, {
    shuffleQuestions: true,
    shuffleOptions: true,
    seed: 555,
  });
  const serialized = serializeAttemptDeliveryLayout(layout);
  const parsed = parseAttemptDeliveryLayout(serialized);
  assert(parsed != null, 'layout round-trips through JSON');
  assert(
    parsed.questionOrder.join(',') === layout.questionOrder.join(','),
    'parsed question order matches'
  );

  const firstLoad = applyAttemptDeliveryLayout(composedFixture, layout);
  const secondLoad = applyAttemptDeliveryLayout(composedFixture, parsed);
  assert(
    firstLoad.map((q) => q.questionId).join(',') === secondLoad.map((q) => q.questionId).join(','),
    'resume replays identical question order'
  );
  assert(
    firstLoad[0].options.map((o) => o.optionId).join(',') ===
      secondLoad[0].options.map((o) => o.optionId).join(','),
    'resume replays identical option order'
  );
}

{
  const layout1 = buildAttemptDeliveryLayout(composedFixture, {
    shuffleQuestions: true,
    shuffleOptions: true,
    seed: deriveAttemptShuffleSeed(100, 'attempt-a'),
  });
  const layout2 = buildAttemptDeliveryLayout(composedFixture, {
    shuffleQuestions: true,
    shuffleOptions: true,
    seed: deriveAttemptShuffleSeed(200, 'attempt-b'),
  });
  assert(
    layout1.questionOrder.join(',') !== layout2.questionOrder.join(','),
    'multiple attempts get different question order'
  );
}

{
  const layout = buildAttemptDeliveryLayout(composedFixture, {
    shuffleQuestions: true,
    shuffleOptions: true,
    seed: 777,
  });
  const delivered = applyAttemptDeliveryLayout(
    composedFixture.map((q) => ({
      ...q,
      questionId: q.questionId,
      options: q.options.map((o) => ({ ...o, optionId: o.optionId, optionText: o.optionText, isCorrect: o.isCorrect })),
    })),
    layout
  );

  const answers = new Map([
    [1, 12],
    [2, 21],
    [3, 32],
  ]);
  const graded = gradeComposedAttempt(delivered, answers, 0);
  assert(graded.correctCount === 3, 'grading correct with shuffled delivery order');
  assert(graded.score === graded.maxScore, 'full score with stable option ids');
}

{
  const layout = buildAttemptDeliveryLayout(composedFixture, {
    shuffleQuestions: true,
    shuffleOptions: true,
    seed: 888,
  });
  const delivered = applyAttemptDeliveryLayout(composedFixture, layout);
  const wrongAnswers = new Map([[1, 11], [2, 22], [3, 31]]);
  const graded = gradeComposedAttempt(delivered, wrongAnswers, 0);
  assert(graded.correctCount === 0, 'grading marks wrong selections regardless of display order');
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
