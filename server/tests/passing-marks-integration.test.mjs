/**
 * Passing marks migration — integration tests (cross-module, no DB).
 *
 * Verifies end-to-end flow: question marks → total → pass/fail → API rejection.
 *
 * Run: npm run test:passing-marks-migration
 */
import { calculateMarksBasedResult } from '../src/grading/gradingCalculation.js';
import { derivePassStatus } from '../src/result/passStatus.js';
import { validatePassingMarksAgainstTotal } from '../src/services/testTotalMarks.service.js';
import { assertTestRulesWhitelist, testRulesBodySchema } from '../src/validators/testRules.schema.js';
import { validateQuestionMarks } from '../src/validators/questionMarks.validation.js';
import { gradeComposedAttempt } from '../src/services/testAttempt/gradeComposedAttempt.js';

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

console.log('passing marks integration — cross-module flow\n');

// Scenario: 4 questions × 1 mark, passing 3, student gets 3 correct
{
  const questions = [
    { effectiveMarks: 1, selectedOptionId: 1, correctOptionId: 1 },
    { effectiveMarks: 1, selectedOptionId: 2, correctOptionId: 2 },
    { effectiveMarks: 1, selectedOptionId: 3, correctOptionId: 3 },
    { effectiveMarks: 1, selectedOptionId: 9, correctOptionId: 4 },
  ];
  const result = calculateMarksBasedResult({ questions, testConfig: { passingMarks: 3 } });
  ok('integration: score 3/4', result.score === 3 && result.maxScore === 4);
  ok('integration: percentage 75', result.percentage === 75);
  ok('integration: pass at exactly 3 marks', result.passStatus === 'PASS');
  ok('integration: derivePassStatus agrees', derivePassStatus({ score: result.score, passingMarks: 3 }) === 'PASS');
}

// Scenario: API rejects legacy percentage field
{
  const whitelist = assertTestRulesWhitelist({ duration_minutes: 30, max_attempts: 1, passing_percentage: 40 });
  ok('integration: API blocks passing_percentage', whitelist.ok === false);

  const rules = testRulesBodySchema.safeParse({
    duration_minutes: 30,
    max_attempts: 1,
    passing_marks: 40,
  });
  ok('integration: API accepts passing_marks only', rules.success === true);
}

// Scenario: import default marks
{
  const imported = validateQuestionMarks(undefined, { defaultWhenMissing: true });
  ok('integration: import defaults to 1 mark', imported.ok && imported.marks === 1);
}

// Scenario: passing marks cannot exceed computed total
{
  const check = validatePassingMarksAgainstTotal(50, 40);
  ok('integration: rejects passing > total', check.ok === false);
}

// Scenario: gradeComposedAttempt + passing marks (submit path)
{
  const composed = [
    {
      questionId: 1,
      questionText: 'Q1',
      effectiveMarks: 2,
      options: [
        { optionId: 10, optionText: 'A', isCorrect: true },
        { optionId: 11, optionText: 'B', isCorrect: false },
      ],
    },
    {
      questionId: 2,
      questionText: 'Q2',
      effectiveMarks: 3,
      options: [
        { optionId: 20, optionText: 'A', isCorrect: true },
        { optionId: 21, optionText: 'B', isCorrect: false },
      ],
    },
  ];
  const graded = gradeComposedAttempt(
    composed,
    new Map([
      [1, 10],
      [2, 20],
    ]),
    0,
    4
  );
  ok('integration: composed grade score 5', graded.score === 5);
  ok('integration: composed grade max 5', graded.maxScore === 5);
  ok('integration: composed pass at threshold 4', graded.passStatus === 'PASS');
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
