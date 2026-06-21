/**
 * Phase 5 — client MCQ UX validation tests.
 *
 * Run: npm run test:quiz-mcq-client-validation
 */
import {
  primaryClientValidationMessage,
  validateQuizMcqQuestionClient,
} from './quizMcqClientValidation.js';

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

const baseQuestion = {
  id: 'q1',
  title: '',
  questionText: '<p>What is 2+2?</p>',
  points: 1,
  questionType: 'multiple_choice',
  collapsed: false,
  showExplanation: false,
  explanation: '',
  choices: [
    { id: 'c1', text: '4', isCorrect: true },
    { id: 'c2', text: '5', isCorrect: false },
  ],
};

console.log('quizMcqClientValidation — Phase 5');

ok('valid question passes', validateQuizMcqQuestionClient(baseQuestion).valid === true);

const noText = { ...baseQuestion, questionText: '' };
ok('empty question text fails', validateQuizMcqQuestionClient(noText).valid === false);

for (const emptyHtml of ['<p></p>', '<p>&nbsp;</p>', '<p><br></p>', '<div></div>', '<span> </span>']) {
  const semanticEmpty = { ...baseQuestion, questionText: emptyHtml };
  ok(`semantically empty question text fails: ${emptyHtml}`, validateQuizMcqQuestionClient(semanticEmpty).valid === false);
}

const fiveChoices = {
  ...baseQuestion,
  choices: [
    { id: 'c1', text: 'A', isCorrect: true },
    { id: 'c2', text: 'B', isCorrect: false },
    { id: 'c3', text: 'C', isCorrect: false },
    { id: 'c4', text: 'D', isCorrect: false },
    { id: 'c5', text: 'E', isCorrect: false },
  ],
};
ok('more than 4 choices fails', validateQuizMcqQuestionClient(fiveChoices).valid === false);

const noCorrect = {
  ...baseQuestion,
  choices: [
    { id: 'c1', text: 'A', isCorrect: false },
    { id: 'c2', text: 'B', isCorrect: false },
  ],
};
ok('no correct fails', validateQuizMcqQuestionClient(noCorrect).valid === false);

const lowPoints = { ...baseQuestion, points: 0.25 };
ok('low points fails', validateQuizMcqQuestionClient(lowPoints).valid === false);

const badUrl = { ...baseQuestion, questionImageUrl: 'javascript:alert(1)' };
ok('bad image url fails', validateQuizMcqQuestionClient(badUrl).valid === false);

const issues = validateQuizMcqQuestionClient(noText).issues;
ok('primary message helper', primaryClientValidationMessage(issues).includes('required'));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
