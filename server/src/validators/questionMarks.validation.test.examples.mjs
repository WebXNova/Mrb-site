/**
 * Question marks validation — unit tests (no DB).
 *
 * Run: npm run test:passing-marks-migration
 */
import {
  validateQuestionMarks,
  validatePassingMarks,
  DEFAULT_QUESTION_MARKS,
  roundQuestionMarks,
} from '../validators/questionMarks.validation.js';
import { validatePassingMarksAgainstTotal } from '../services/testTotalMarks.service.js';
import { derivePassStatus } from '../result/passStatus.js';
import { calculateMarksBasedResult } from '../grading/gradingCalculation.js';
import { assertTestRulesWhitelist, TEST_RULES_ALLOWED_KEYS } from '../validators/testRules.schema.js';

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

console.log('questionMarks.validation — unit tests\n');

ok('default marks when missing', validateQuestionMarks(null).marks === DEFAULT_QUESTION_MARKS);
ok('accepts valid marks', validateQuestionMarks(2.5).ok === true);
ok('rejects zero', validateQuestionMarks(0).ok === false);
ok('rejects negative', validateQuestionMarks(-1).ok === false);
ok('rejects invalid decimals', validateQuestionMarks(1.234).ok === false);
ok('roundQuestionMarks preserves two decimals', roundQuestionMarks(2.5) === 2.5);

console.log('\npassing marks validation\n');

ok('passing marks required', validatePassingMarks('').ok === false);
ok('passing marks accepts zero', validatePassingMarks(0).ok === true);
ok('passing marks accepts decimal', validatePassingMarks(40.5).marks === 40.5);

console.log('\ntotal marks vs passing marks\n');

ok('passing <= total valid', validatePassingMarksAgainstTotal(40, 100).ok === true);
ok('passing > total invalid', validatePassingMarksAgainstTotal(101, 100).ok === false);
ok('no questions blocks passing', validatePassingMarksAgainstTotal(10, 0).ok === false);

console.log('\npass/fail derivation (marks-based)\n');

ok('score >= passing → PASS', derivePassStatus({ score: 40, passingMarks: 40 }) === 'PASS');
ok('score < passing → FAIL', derivePassStatus({ score: 39.99, passingMarks: 40 }) === 'FAIL');
ok('stored grade takes precedence', derivePassStatus({ grade: 'FAIL', score: 100, passingMarks: 0 }) === 'FAIL');

console.log('\ngrading calculation (marks threshold)\n');

{
  const result = calculateMarksBasedResult({
    questions: [
      { effectiveMarks: 5, selectedOptionId: 1, correctOptionId: 1 },
      { effectiveMarks: 5, selectedOptionId: 2, correctOptionId: 2 },
    ],
    testConfig: { passingMarks: 8 },
  });
  ok('all correct score 10', result.score === 10);
  ok('max score 10', result.maxScore === 10);
  ok('percentage derived 100', result.percentage === 100);
  ok('pass at threshold 8', result.passStatus === 'PASS');
}

{
  const result = calculateMarksBasedResult({
    questions: [
      { effectiveMarks: 5, selectedOptionId: 1, correctOptionId: 1 },
      { effectiveMarks: 5, selectedOptionId: 3, correctOptionId: 2 },
    ],
    testConfig: { passingMarks: 8 },
  });
  ok('partial score 5', result.score === 5);
  ok('fail below passing 8', result.passStatus === 'FAIL');
  ok('percentage 50', result.percentage === 50);
}

console.log('\ntest rules schema security\n');

ok('passing_percentage forbidden', assertTestRulesWhitelist({ passing_percentage: 40 }).ok === false);
ok('total_marks forbidden', assertTestRulesWhitelist({ total_marks: 100 }).ok === false);
ok('passing_marks allowed', TEST_RULES_ALLOWED_KEYS.includes('passing_marks'));
ok('passing_percentage not in allowed keys', !TEST_RULES_ALLOWED_KEYS.includes('passing_percentage'));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
