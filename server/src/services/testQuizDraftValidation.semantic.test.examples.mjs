/**
 * Quiz draft validation — semantic empty question tests (G-01).
 *
 * Run: node src/services/testQuizDraftValidation.semantic.test.examples.mjs
 */
import { validateAndSanitizeQuizDraftPayload } from './testQuizDraftValidation.service.js';

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

const baseDraft = {
  version: 1,
  testId: 42,
  storageKey: '42',
  questions: [
    {
      id: 'q-1',
      title: '',
      questionType: 'short_answer',
      questionText: '<p>Real question</p>',
      points: 1,
      collapsed: false,
      showExplanation: false,
      explanation: '',
      choices: [{ id: 'c1', text: 'N/A', isCorrect: true }],
    },
  ],
};

console.log('testQuizDraftValidation — semantic empty (G-01)\n');

for (const emptyHtml of ['<p></p>', '<p>&nbsp;</p>', '<p><br></p>', '<div></div>', '<span> </span>']) {
  let rejected = false;
  try {
    validateAndSanitizeQuizDraftPayload(42, {
      ...baseDraft,
      questions: [{ ...baseDraft.questions[0], questionText: emptyHtml }],
    });
  } catch {
    rejected = true;
  }
  assert(rejected, `draft save rejects semantically empty questionText: ${emptyHtml}`);
}

{
  const sanitized = validateAndSanitizeQuizDraftPayload(42, baseDraft);
  assert(sanitized.questions[0].questionText.includes('Real question'), 'legitimate draft question preserved');
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
