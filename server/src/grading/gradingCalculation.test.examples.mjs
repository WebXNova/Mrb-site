/**
 * Marks-based grading — acceptance tests (no DB).
 *
 * Run: npm run test:grading
 */
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  calculateMarksBasedResult,
  calculatePercentage,
  normalizeEffectiveMarks,
  resolveQuestionEffectiveMarks,
} from './gradingCalculation.js';
import { calculateResult } from './grading.service.js';
import { gradeComposedAttempt } from '../services/testAttempt/gradeComposedAttempt.js';
import { derivePassStatus } from '../result/passStatus.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

function buildMixedMarkQuestions(answers) {
  return [
    {
      questionId: 1,
      effectiveMarks: 5,
      selectedOptionId: answers[0]?.selected ?? null,
      correctOptionId: 10,
    },
    {
      questionId: 2,
      effectiveMarks: 2,
      selectedOptionId: answers[1]?.selected ?? null,
      correctOptionId: 20,
    },
    {
      questionId: 3,
      effectiveMarks: 3,
      selectedOptionId: answers[2]?.selected ?? null,
      correctOptionId: 30,
    },
  ];
}

function buildMixedMarkComposed() {
  return [
    {
      questionId: 1,
      questionText: 'Q1',
      effectiveMarks: 5,
      marks: 1,
      options: [
        { optionId: 10, optionText: 'A', isCorrect: true },
        { optionId: 11, optionText: 'B', isCorrect: false },
      ],
    },
    {
      questionId: 2,
      questionText: 'Q2',
      effectiveMarks: 2,
      marks: 1,
      options: [
        { optionId: 20, optionText: 'A', isCorrect: true },
        { optionId: 21, optionText: 'B', isCorrect: false },
      ],
    },
    {
      questionId: 3,
      questionText: 'Q3',
      effectiveMarks: 3,
      marks: 1,
      options: [
        { optionId: 30, optionText: 'A', isCorrect: true },
        { optionId: 31, optionText: 'B', isCorrect: false },
      ],
    },
  ];
}

console.log('gradingCalculation — acceptance tests\n');

ok('normalizeEffectiveMarks defaults invalid to 1', normalizeEffectiveMarks(0) === 1);
ok('resolveQuestionEffectiveMarks prefers effectiveMarks', resolveQuestionEffectiveMarks({ effectiveMarks: 5, marks: 1 }) === 5);
ok('resolveQuestionEffectiveMarks reads effective_marks', resolveQuestionEffectiveMarks({ effective_marks: 3 }) === 3);

{
  const result = calculateMarksBasedResult({
    questions: buildMixedMarkQuestions([
      { selected: 10 },
      { selected: 20 },
      { selected: 30 },
    ]),
    testConfig: { passingMarks: 6, negativeMarkingEnabled: false, negativeMarkingValue: 0 },
  });

  ok('mixed-mark max score = 10', result.maxScore === 10);
  ok('mixed-mark all correct score = 10', result.score === 10);
  ok('mixed-mark all correct percentage = 100', result.percentage === 100);
  ok('mixed-mark all correct pass at 6 marks', result.passStatus === 'PASS');
}

{
  const result = calculateMarksBasedResult({
    questions: buildMixedMarkQuestions([
      { selected: 10 },
      { selected: 21 },
      { selected: null },
    ]),
    testConfig: { passingMarks: 6, negativeMarkingEnabled: false, negativeMarkingValue: 0 },
  });

  ok('partial correct score = 5', result.score === 5);
  ok('partial correct max = 10', result.maxScore === 10);
  ok('partial correct percentage = 50', result.percentage === 50);
  ok('partial correct fail below 6 marks', result.passStatus === 'FAIL');
  ok('partial correct counts', result.correctAnswers === 1 && result.wrongAnswers === 1 && result.unansweredAnswers === 1);
}

{
  const result = calculateMarksBasedResult({
    questions: buildMixedMarkQuestions([
      { selected: 10 },
      { selected: 21 },
      { selected: 31 },
    ]),
    testConfig: { passingMarks: 50, negativeMarkingEnabled: true, negativeMarkingValue: 0.25 },
  });

  ok('negative marking score = 4.5 (5 - 2×0.25)', result.score === 4.5);
  ok('negative marking max = 10', result.maxScore === 10);
  ok('negative marking percentage = 45', result.percentage === 45);
}

{
  const composed = buildMixedMarkComposed();
  const graded = gradeComposedAttempt(
    composed,
    new Map([
      [1, 10],
      [2, 20],
      [3, 30],
    ]),
    0
  );

  ok('gradeComposedAttempt maxScore = 10', graded.maxScore === 10);
  ok('gradeComposedAttempt score = 10', graded.score === 10);
  ok('gradeComposedAttempt ignores bank marks when effectiveMarks set', graded.details[0].marks === 5);
  ok('gradeComposedAttempt detail marksAwarded uses effective marks', graded.details[0].marksAwarded === 5);
}

{
  const graded = gradeComposedAttempt(buildMixedMarkComposed(), new Map([[1, 10]]), 0);
  ok('gradeComposedAttempt partial score = 5', graded.score === 5);
  ok('gradeComposedAttempt partial percentage = 50', graded.percentage === 50);
}

{
  const percentage = calculatePercentage(5, 10);
  const passStatus = derivePassStatus({ score: 5, passingMarks: 6 });
  ok('result passStatus uses marks threshold', passStatus === 'FAIL');
}

{
  const gradingRepo = readFileSync(path.join(__dirname, 'grading.repository.js'), 'utf8');
  ok('repository loads effective_marks', gradingRepo.includes('AS effective_marks'));
  ok('grading service delegates to calculator', readFileSync(path.join(__dirname, 'grading.service.js'), 'utf8').includes('calculateMarksBasedResult'));
  ok('grading context maps effective_marks', readFileSync(path.join(__dirname, 'grading.service.js'), 'utf8').includes('row.effective_marks'));
}

{
  const result = calculateResult({
    questions: buildMixedMarkQuestions([{ selected: 10 }, { selected: 20 }, { selected: 30 }]),
    testConfig: { passingMarks: 0, negativeMarkingEnabled: false, negativeMarkingValue: 0 },
  });
  ok('grading.service calculateResult max = 10', result.maxScore === 10);
  ok('grading.service calculateResult score = 10', result.score === 10);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
