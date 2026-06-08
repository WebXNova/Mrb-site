/**
 * Unit checks for grading calculations (no DB).
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
      { questionId: 1, selectedOptionId: 10, correctOptionId: 10 },
      { questionId: 2, selectedOptionId: 21, correctOptionId: 20 },
      { questionId: 3, selectedOptionId: null, correctOptionId: 30 },
    ],
    testConfig: {
      passingPercentage: 60,
      negativeMarkingEnabled: false,
      negativeMarkingValue: 0,
    },
  });

  ok('counts correct answers', result.correctAnswers === 1);
  ok('counts wrong answers', result.wrongAnswers === 1);
  ok('counts unanswered separately', result.unansweredAnswers === 1);
  ok('score equals correct when no negative marking', result.score === 1);
  ok('percentage uses correct/total', result.percentage === 33.33);
  ok('pass status FAIL below threshold', result.passStatus === 'FAIL');
}

{
  const result = calculateResult({
    questions: [
      { questionId: 1, selectedOptionId: 10, correctOptionId: 10 },
      { questionId: 2, selectedOptionId: 21, correctOptionId: 20 },
    ],
    testConfig: {
      passingPercentage: 50,
      negativeMarkingEnabled: true,
      negativeMarkingValue: 0.25,
    },
  });

  ok('negative marking reduces score', result.score === 0.75);
  ok('pass with 50% correct answers', result.passStatus === 'PASS');
}

{
  const result = calculateResult({
    questions: [],
    testConfig: {
      passingPercentage: 40,
      negativeMarkingEnabled: false,
      negativeMarkingValue: 0,
    },
  });

  ok('divide-by-zero safe percentage', result.percentage === 0);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
