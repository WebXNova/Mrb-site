/**
 * Semantic HTML content validation — unit tests (G-01).
 *
 * Run: node src/utils/semanticHtmlContent.test.examples.mjs
 */
import { applyQuestionWriteSecurity } from '../security/questionContentSecurity.js';
import { ApiError } from './apiError.js';
import {
  extractVisibleTextFromHtml,
  isSemanticallyEmptyHtml,
  normalizeComparableHtmlText,
} from './semanticHtmlContent.js';
import { validateMcqQuestion } from '../validation/mcq/mcqValidation.engine.js';
import { MCQ_ERROR_CODES } from '../validation/mcq/mcqValidation.constants.js';
import { standardMcqOptions } from '../../scripts/fixtures/standardMcqOptions.js';

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

const SEMANTICALLY_EMPTY = [
  '<p></p>',
  '<p>&nbsp;</p>',
  '<p><br></p>',
  '<div></div>',
  '<span> </span>',
  '<p><strong></strong></p>',
  '<p>\u00a0</p>',
  '<p>\u200b</p>',
  '   ',
];

const LEGITIMATE_RICH_TEXT = [
  ['<p>What is 2+2?</p>', 'What is 2+2?'],
  ['<p><strong>Bold</strong> question</p>', 'Bold question'],
  ['<p>Water: H<sub>2</sub>O</p>', 'Water: H2O'],
  ['<ol><li>First</li></ol>', 'First'],
  ['<p style="text-align:center">Centered</p>', 'Centered'],
];

console.log('semanticHtmlContent — G-01 unit tests\n');

for (const html of SEMANTICALLY_EMPTY) {
  assert(isSemanticallyEmptyHtml(html), `rejects semantically empty: ${JSON.stringify(html)}`);
  assert(extractVisibleTextFromHtml(html).length === 0, `visible text empty: ${JSON.stringify(html)}`);
}

for (const [html, expected] of LEGITIMATE_RICH_TEXT) {
  const visible = extractVisibleTextFromHtml(html);
  assert(visible === expected, `preserves visible text for ${JSON.stringify(html)}`);
  assert(!isSemanticallyEmptyHtml(html), `accepts legitimate rich text: ${JSON.stringify(html)}`);
}

assert(
  normalizeComparableHtmlText('<p>  Same </p>') === normalizeComparableHtmlText('<span>same</span>'),
  'comparable text ignores tags and casing'
);

{
  const result = validateMcqQuestion(
    {
      question_text: '<p>&nbsp;</p>',
      options: standardMcqOptions,
    },
    { stripHtml: true, context: 'manual_save' }
  );
  assert(
    result.valid === false &&
      result.errors.some((issue) => issue.code === MCQ_ERROR_CODES.QUESTION_TEXT_REQUIRED),
    'MCQ engine rejects semantically empty question_text'
  );
}

{
  const result = validateMcqQuestion(
    {
      question_text: '<p>Valid stem?</p>',
      options: [
        { option_key: 'A', option_text: '<p><br></p>', is_correct: true },
        { option_key: 'B', option_text: 'B', is_correct: false },
      ],
    },
    { stripHtml: true, context: 'publish' }
  );
  assert(
    result.valid === false &&
      result.errors.some((issue) => issue.code === MCQ_ERROR_CODES.EMPTY_OPTION_TEXT),
    'MCQ engine rejects semantically empty option_text'
  );
}

{
  let rejected = false;
  try {
    applyQuestionWriteSecurity({
      question_text: '<p></p>',
      explanation: null,
      options: standardMcqOptions,
    });
  } catch (error) {
    rejected = error instanceof ApiError && error.code === 'INVALID_QUESTION_TEXT';
  }
  assert(rejected, 'question write security rejects empty question_text');
}

{
  let rejected = false;
  try {
    applyQuestionWriteSecurity({
      question_text: '<p>Valid</p>',
      explanation: null,
      options: [
        { option_text: '<span>&nbsp;</span>', is_correct: true },
        { option_text: 'B', is_correct: false },
        { option_text: 'C', is_correct: false },
        { option_text: 'D', is_correct: false },
      ],
    });
  } catch (error) {
    rejected = error instanceof ApiError && error.code === 'INVALID_OPTION_TEXT';
  }
  assert(rejected, 'question write security rejects empty option_text');
}

{
  const secured = applyQuestionWriteSecurity({
    question_text: '<p><strong>Real</strong> question</p>',
    explanation: null,
    options: standardMcqOptions,
  });
  assert(secured.question_text.includes('<strong>'), 'legitimate rich-text question_text preserved');
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
