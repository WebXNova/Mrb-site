/**
 * Verifies student attempt layer uses question-bank composition (no embedded test_questions columns).
 * Run: node scripts/verify-test-attempt-composition.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { gradeComposedAttempt } from '../src/services/testAttempt/gradeComposedAttempt.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.join(__dirname, '..');

function read(relPath) {
  return fs.readFileSync(path.join(serverRoot, relPath), 'utf8');
}

function assertNoMatch(label, content, pattern) {
  if (pattern.test(content)) {
    throw new Error(`${label}: legacy pattern still present: ${pattern}`);
  }
  console.log(`PASS ${label}`);
}

function assertMatch(label, content, pattern) {
  if (!pattern.test(content)) {
    throw new Error(`${label}: expected pattern missing: ${pattern}`);
  }
  console.log(`PASS ${label}`);
}

const attemptService = read('src/services/testAttempt.service.js');
const secureCtx = read('src/services/testAttempt/secureAttemptContext.js');

assertNoMatch('attempt service — options_json', attemptService, /options_json/);
assertNoMatch('attempt service — order_index on test_questions', attemptService, /order_index/);
assertNoMatch('attempt service — test_attempt_answers', attemptService, /test_attempt_answers/);
assertNoMatch('attempt service — embedded correct_option', attemptService, /correct_option/);
assertMatch('attempt service — loadComposedTestQuestions', attemptService, /loadComposedTestQuestions/);
assertMatch('attempt service — student_answers', attemptService, /student_answers/);
assertMatch('attempt service — mapComposedQuestionsForStudentAttempt', attemptService, /mapComposedQuestionsForStudentAttempt/);

assertMatch('secure context — question_id validation', secureCtx, /tq\.question_id/);
assertNoMatch('secure context — link row id validation', secureCtx, /WHERE q\.id = \? AND q\.test_id/);
assertMatch('secure context — option ownership', secureCtx, /assertOptionBelongsToQuestion/);

// Case 2 & 3: grading accepts valid / rejects foreign via map
const composed = [
  {
    questionId: 10,
    questionText: 'Q1',
    marks: 2,
    effectiveMarks: 2,
    explanation: 'Because',
    options: [
      { optionId: 101, optionText: 'A', isCorrect: false },
      { optionId: 102, optionText: 'B', isCorrect: true },
    ],
  },
];

const valid = gradeComposedAttempt(composed, new Map([[10, 102]]), 0);
if (valid.correctCount !== 1 || valid.score !== 2) {
  throw new Error('Case 2 failed: valid answer should score');
}
console.log('PASS Case 2 — valid answer graded');

const wrongQuestion = gradeComposedAttempt(composed, new Map([[99, 102]]), 0);
if (wrongQuestion.correctCount !== 0) {
  throw new Error('Case 3 failed: foreign question_id should not score');
}
console.log('PASS Case 3 — foreign question_id does not affect score');

const wrongOption = gradeComposedAttempt(composed, new Map([[10, 101]]), 0);
if (wrongOption.correctCount !== 0) {
  throw new Error('Case 4 failed: wrong option should not score as correct');
}
console.log('PASS Case 4 — wrong option_id not counted correct');

const empty = gradeComposedAttempt(composed, new Map(), 0);
if (empty.skippedCount !== 1) {
  throw new Error('Case 5 prep failed: skipped count');
}
console.log('PASS Case 5 — empty answers handled (no crash)');

console.log('Test attempt composition verification complete.');
