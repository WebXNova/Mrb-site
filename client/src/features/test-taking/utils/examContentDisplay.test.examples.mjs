/**
 * Live-exam display helpers — strip storage prefixes, progress copy, timer format.
 *
 * Run: node src/features/test-taking/utils/examContentDisplay.test.examples.mjs
 */
import assert from 'node:assert/strict';
import { formatExamTime } from './formatTime.js';
import { formatExamProgressCopy, stripExamContentLabels } from './examContentDisplay.js';
import {
  countAnswered,
  getQuestionStatus,
  getQuestionStatusLabel,
} from './questionStatus.js';
import {
  normalizeAttemptQuestion,
  normalizeAttemptQuestions,
} from './normalizeQuestion.js';
import { isAllQuestionsDisplay } from '../../../utils/testPresentation.js';

assert.equal(
  stripExamContentLabels('QUESTION: Which SI unit is used for measuring time?'),
  'Which SI unit is used for measuring time?'
);
assert.equal(
  stripExamContentLabels('QUESTION: Which instrument is used to measure the mass of an object?'),
  'Which instrument is used to measure the mass of an object?'
);
assert.equal(
  stripExamContentLabels('<p>QUESTION: Which SI unit is used for measuring time?</p>'),
  '<p>Which SI unit is used for measuring time?</p>'
);
assert.equal(
  stripExamContentLabels('<p><strong>QUESTION:</strong> Which SI unit?</p>'),
  '<p>Which SI unit?</p>'
);
assert.equal(stripExamContentLabels('ANSWER: Minute'), 'Minute');
assert.equal(stripExamContentLabels('EXPLANATION: Because seconds.'), 'Because seconds.');
assert.equal(
  stripExamContentLabels('Which SI unit is used for measuring time?'),
  'Which SI unit is used for measuring time?'
);
assert.match(
  stripExamContentLabels('The word QUESTION: appears later'),
  /The word QUESTION:/
);

assert.equal(
  formatExamProgressCopy({
    currentIndex: 0,
    totalQuestions: 20,
    answeredCount: 0,
    displayMode: 'one_per_page',
  }),
  'Question 1 of 20 · 0 answered'
);
assert.equal(
  formatExamProgressCopy({
    currentIndex: 0,
    totalQuestions: 20,
    answeredCount: 0,
    displayMode: 'all',
  }),
  '0 of 20 answered'
);
assert.equal(
  formatExamProgressCopy({
    currentIndex: 0,
    totalQuestions: 20,
    answeredCount: 0,
    layoutMode: 'horizontal',
  }),
  'Question 1 of 20 · 0 answered'
);

assert.equal(formatExamTime(3590), '59:50');
assert.equal(formatExamTime(0), '00:00');

const mapped = normalizeAttemptQuestion({
  questionId: 9,
  questionText: 'QUESTION: Sample stem?',
  options: [
    { optionId: 1, optionText: 'Minute' },
    { optionId: 2, optionText: 'Hour' },
  ],
});
assert.equal(mapped.id, '9');
assert.equal(mapped.options.length, 2);
assert.equal(mapped.options[0].id, 1);
assert.equal(mapped.options[0].text, 'Minute');
assert.equal(mapped.options[1].text, 'Hour');
assert.ok(mapped.options.every((option) => typeof option.text === 'string' && option.text.length > 0));
assert.notEqual(mapped.options[0].text, mapped.options[1].text);

const questions = normalizeAttemptQuestions([
  { id: 1, question_text: 'Q1', options: [{ id: 11, text: 'A' }] },
  { id: 2, question_text: 'Q2', options: [{ option_id: 22, option_text: 'B' }] },
]);
assert.equal(questions.length, 2);

const answers = { 1: '11' };
assert.equal(countAnswered(['1', '2'], answers), 1);
assert.equal(
  getQuestionStatus({ questionId: '1', currentId: '1', answers, visited: new Set(['1']) }),
  'current'
);
assert.equal(
  getQuestionStatus({ questionId: '1', currentId: '2', answers, visited: new Set(['1']) }),
  'answered'
);
assert.equal(
  getQuestionStatus({
    questionId: '2',
    currentId: '1',
    answers,
    visited: new Set(['2']),
  }),
  'visited'
);
assert.equal(
  getQuestionStatus({
    questionId: '3',
    currentId: '1',
    answers,
    visited: new Set(),
  }),
  'unvisited'
);
assert.equal(getQuestionStatusLabel('visited'), 'not answered');
assert.equal(getQuestionStatusLabel('unvisited'), 'not visited');
assert.equal(getQuestionStatusLabel('answered'), 'answered');
assert.equal(getQuestionStatusLabel('current'), 'current');

assert.equal(isAllQuestionsDisplay('all'), true);
assert.equal(isAllQuestionsDisplay('one_per_page'), false);
assert.equal(isAllQuestionsDisplay('vertical'), true);

console.log('examContentDisplay: all assertions passed');
