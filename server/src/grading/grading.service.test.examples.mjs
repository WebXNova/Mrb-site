/**
 * Grading engine — calculation examples (no DB).
 * Run: node src/grading/grading.service.test.examples.mjs
 */
import { calculateResult } from './grading.service.js';

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

console.log('gradingEngine — calculation examples\n');

{
  const result = calculateResult({
    questions: [
      { questionId: 1, effectiveMarks: 5, selectedOptionId: 10, correctOptionId: 10 },
      { questionId: 2, effectiveMarks: 2, selectedOptionId: 21, correctOptionId: 20 },
      { questionId: 3, effectiveMarks: 3, selectedOptionId: null, correctOptionId: 30 },
    ],
    testConfig: {
      passingMarks: 6,
      negativeMarkingEnabled: false,
      negativeMarkingValue: 0,
    },
  });

  ok('counts correct answers', result.correctAnswers === 1);
  ok('counts wrong answers', result.wrongAnswers === 1);
  ok('counts unanswered separately', result.unansweredAnswers === 1);
  ok('score equals marks earned (5)', result.score === 5);
  ok('max score sums effective marks (10)', result.maxScore === 10);
  ok('percentage uses score/maxScore (50%)', result.percentage === 50);
  ok('pass status FAIL below passing marks', result.passStatus === 'FAIL');
}

{
  const result = calculateResult({
    questions: [
      { questionId: 1, effectiveMarks: 1, selectedOptionId: 10, correctOptionId: 10 },
      { questionId: 2, effectiveMarks: 1, selectedOptionId: 21, correctOptionId: 20 },
    ],
    testConfig: {
      passingMarks: 1,
      negativeMarkingEnabled: true,
      negativeMarkingValue: 0.25,
    },
  });

  ok('negative marking reduces score', result.score === 0.75);
  ok('percentage reflects marks after penalty', result.percentage === 37.5);
  ok('fail when score below passing marks', result.passStatus === 'FAIL');
}

{
  const result = calculateResult({
    questions: [],
    testConfig: {
      passingMarks: 0,
      negativeMarkingEnabled: false,
      negativeMarkingValue: 0,
    },
  });

  ok('divide-by-zero safe percentage', result.percentage === 0);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
