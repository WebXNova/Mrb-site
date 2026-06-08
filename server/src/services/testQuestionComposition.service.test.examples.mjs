/**
 * Unit checks for student attempt question option mapping (no DB).
 * Run: node src/services/testQuestionComposition.service.test.examples.mjs
 */
import assert from 'node:assert/strict';
import {
  mapComposedQuestionsForStudentAttempt,
  summarizeComposedQuestionOptions,
} from './testQuestionComposition.service.js';

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

console.log('testQuestionComposition — option mapping examples\n');

const composed = [
  {
    questionId: 10,
    questionText: '<p>Sample?</p>',
    marks: 1,
    displayOrder: 0,
    options: [
      { optionId: 101, optionText: 'A' },
      { optionId: 102, optionText: 'B' },
    ],
  },
  {
    questionId: 11,
    questionText: 'No options',
    marks: 1,
    displayOrder: 1,
    options: [],
  },
];

const mapped = mapComposedQuestionsForStudentAttempt(composed);
ok('maps question id/text', mapped[0].id === 10 && mapped[0].questionText.includes('Sample'));
ok('maps option id/text', mapped[0].options[0].id === 101 && mapped[0].options[0].text === 'A');
ok('preserves empty options array', Array.isArray(mapped[1].options) && mapped[1].options.length === 0);

const stats = summarizeComposedQuestionOptions(mapped);
ok('summarizes option counts', stats[0].optionCount === 2 && stats[1].optionCount === 0);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
