/**
 * G-RT-07 — result visibility unit tests.
 *
 * Run: npm run test:result-visibility
 */
import {
  assertStudentResultVisible,
  isShowAnswersAfterSubmitEnabled,
  isShowResultImmediatelyEnabled,
  mapPortalAnswersToLegacyDetails,
  redactStudentResultListItem,
  sanitizeGradingDetailItems,
} from './testResultVisibility.service.js';
import { ResultNotAccessibleError } from '../result/result.errors.js';

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

function expectThrow(fn, ErrorType, message) {
  try {
    fn();
    failed += 1;
    console.error(`  ✗ ${message} (no throw)`);
  } catch (error) {
    if (error instanceof ErrorType) {
      passed += 1;
      console.log(`  ✓ ${message}`);
    } else {
      failed += 1;
      console.error(`  ✗ ${message} (wrong error)`, error);
    }
  }
}

console.log('testResultVisibility.service — G-RT-07\n');

assert(isShowResultImmediatelyEnabled(1) && !isShowResultImmediatelyEnabled(0), 'show_result_immediately flags');
assert(isShowAnswersAfterSubmitEnabled(1) && !isShowAnswersAfterSubmitEnabled(0), 'show_answers_after_submit flags');

expectThrow(
  () => assertStudentResultVisible({ show_result_immediately: 0 }, { attemptId: 9 }),
  ResultNotAccessibleError,
  'withheld results throw ResultNotAccessibleError'
);

try {
  assertStudentResultVisible({ show_result_immediately: 1 });
  passed += 1;
  console.log('  ✓ visible results pass assert');
} catch {
  failed += 1;
  console.error('  ✗ visible results pass assert');
}

{
  const redacted = redactStudentResultListItem({
    show_result_immediately: 0,
    score: 18,
    max_score: 20,
    percentage: 90,
    pass_status: 'PASS',
  });
  assert(
    redacted.resultAvailable === false &&
      redacted.score === null &&
      redacted.percentage === null &&
      redacted.status === null,
    'list item redacts scores when results withheld'
  );
}

{
  const details = sanitizeGradingDetailItems(
    [
      {
        questionId: 1,
        questionText: 'Q?',
        selectedOptionText: 'A',
        correctOptionText: 'B',
        isCorrect: false,
        explanation: 'Because',
        options: [{ id: 1, isCorrect: true }],
      },
    ],
    { show_answers_after_submit: 0, show_explanations: 1 }
  );
  assert(details === null, 'grading details omitted when answers withheld');
}

{
  const details = sanitizeGradingDetailItems(
    [
      {
        questionId: 1,
        questionText: 'Q?',
        selectedOptionText: 'A',
        correctOptionText: 'B',
        isCorrect: false,
        explanation: 'Because',
        options: [{ id: 1, isCorrect: true }],
      },
    ],
    { show_answers_after_submit: 1, show_explanations: 0 }
  );
  assert(
    details?.length === 1 &&
      details[0].correctOptionText === 'B' &&
      details[0].explanation == null &&
      Array.isArray(details[0].options) &&
      details[0].options.length === 1,
    'answer review strips explanations but preserves options metadata'
  );
}

{
  const mapped = mapPortalAnswersToLegacyDetails([
    { question: 'Q', your_answer: 'A', correct_answer: 'B', status: 'wrong' },
  ]);
  assert(mapped?.[0]?.correctOptionText === 'B', 'portal answers map to legacy details');
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
