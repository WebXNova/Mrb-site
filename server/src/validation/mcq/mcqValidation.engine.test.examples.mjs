/**
 * MCQ validation engine — unit tests.
 *
 * Run: node src/validation/mcq/mcqValidation.engine.test.examples.mjs
 */
import { standardMcqOptions } from '../../../scripts/fixtures/standardMcqOptions.js';
import { MCQ_ERROR_CODES } from './mcqValidation.constants.js';
import {
  assertValidMcqOptions,
  assertValidMcqQuestion,
  validateMcqQuestion,
  validateMcqQuizDraftQuestion,
} from './mcqValidation.engine.js';
import { validateOptions } from '../../validators/questionOptions.validation.js';

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

function expectCode(fn, code, label) {
  let caught = null;
  try {
    fn();
  } catch (error) {
    caught = error;
  }
  const actualCode = caught?.issues?.[0]?.code || caught?.code || caught?.errorCode;
  assert(caught != null && actualCode === code, `${label} → ${code}`);
}

console.log('mcqValidation.engine — unit tests\n');

{
  const normalized = assertValidMcqOptions(standardMcqOptions, { context: 'manual_save' });
  assert(normalized.options.length === 4, 'accepts standard 4-option MCQ');
  assert(normalized.options.filter((o) => o.is_correct).length === 1, 'exactly one correct option');
}

{
  const twoOptions = [
    { option_key: 'A', option_text: 'Yes', is_correct: true },
    { option_key: 'B', option_text: 'No', is_correct: false },
  ];
  const normalized = assertValidMcqOptions(twoOptions);
  assert(normalized.options.length === 2, 'accepts minimum 2 options');
}

expectCode(
  () =>
    assertValidMcqOptions([
      { option_key: 'A', option_text: 'Only', is_correct: true },
    ]),
  MCQ_ERROR_CODES.INVALID_OPTION_COUNT,
  'rejects fewer than 2 options'
);

expectCode(
  () =>
    assertValidMcqOptions(
      Array.from({ length: 5 }, (_, index) => ({
        option_key: String.fromCharCode(65 + index),
        option_text: `Option ${index}`,
        is_correct: index === 0,
      }))
    ),
  MCQ_ERROR_CODES.INVALID_OPTION_COUNT,
  'rejects more than 4 options'
);

expectCode(
  () =>
    assertValidMcqOptions([
      { option_key: 'A', option_text: 'A', is_correct: false },
      { option_key: 'B', option_text: 'B', is_correct: false },
      { option_key: 'C', option_text: 'C', is_correct: false },
      { option_key: 'D', option_text: 'D', is_correct: false },
    ]),
  MCQ_ERROR_CODES.NO_CORRECT_OPTION,
  'rejects zero correct answers'
);

expectCode(
  () =>
    assertValidMcqOptions([
      { option_key: 'A', option_text: 'A', is_correct: true },
      { option_key: 'B', option_text: 'B', is_correct: true },
      { option_key: 'C', option_text: 'C', is_correct: false },
      { option_key: 'D', option_text: 'D', is_correct: false },
    ]),
  MCQ_ERROR_CODES.MULTIPLE_CORRECT_OPTIONS,
  'rejects multiple correct answers'
);

expectCode(
  () =>
    assertValidMcqOptions([
      { option_key: 'A', option_text: '   ', is_correct: true },
      { option_key: 'B', option_text: 'B', is_correct: false },
    ]),
  MCQ_ERROR_CODES.EMPTY_OPTION_TEXT,
  'rejects empty option text'
);

expectCode(
  () =>
    assertValidMcqOptions([
      { option_key: 'A', option_text: 'Same', is_correct: true },
      { option_key: 'B', option_text: 'same', is_correct: false },
    ]),
  MCQ_ERROR_CODES.DUPLICATE_OPTION_TEXT,
  'rejects duplicate option text'
);

expectCode(
  () =>
    assertValidMcqQuestion({
      question_text: 'What is 2+2?',
      question_image_url: 'javascript:alert(1)',
      options: standardMcqOptions,
    }),
  MCQ_ERROR_CODES.INVALID_QUESTION_IMAGE_URL,
  'rejects invalid question image URL'
);

expectCode(
  () =>
    assertValidMcqQuestion({
      question_text: 'Pick one',
      options: [
        { option_key: 'A', option_text: 'A', is_correct: true, image_url: 'data:image/png;base64,abc' },
        { option_key: 'B', option_text: 'B', is_correct: false },
      ],
    }),
  MCQ_ERROR_CODES.INVALID_OPTION_IMAGE_URL,
  'rejects invalid option image URL'
);

{
  const draftQuestion = {
    id: 'q-1',
    questionType: 'multiple_choice',
    questionText: '<p>Capital of France?</p>',
    choices: [
      { id: 'c1', text: 'Paris', isCorrect: true },
      { id: 'c2', text: 'London', isCorrect: false },
    ],
  };
  const result = validateMcqQuizDraftQuestion(draftQuestion, 0, { context: 'autosave' });
  assert(result.valid === true, 'validates quiz draft MCQ (autosave context)');
}

{
  const missingText = validateMcqQuizDraftQuestion(
    {
      id: 'q-2',
      questionType: 'multiple_choice',
      questionText: '',
      choices: [
        { id: 'c1', text: 'A', isCorrect: true },
        { id: 'c2', text: 'B', isCorrect: false },
      ],
    },
    1,
    { context: 'publish' }
  );
  assert(
    missingText.valid === false &&
      missingText.errors[0]?.code === MCQ_ERROR_CODES.QUESTION_TEXT_REQUIRED,
    'rejects missing question text on publish draft MCQ'
  );
}

{
  const viaWrapper = validateOptions(standardMcqOptions);
  assert(viaWrapper.length === 4, 'questionOptions.validation delegates to engine');
}

{
  const result = validateMcqQuestion({
    question_text: 'Sample?',
    options: standardMcqOptions,
  }, { context: 'publish' });
  assert(result.valid === true && result.meta.context === 'publish', 'publish context metadata preserved');
}

const SEMANTICALLY_EMPTY_QUESTION_HTML = [
  '<p></p>',
  '<p>&nbsp;</p>',
  '<p><br></p>',
  '<div></div>',
  '<span> </span>',
];

for (const emptyHtml of SEMANTICALLY_EMPTY_QUESTION_HTML) {
  const result = validateMcqQuestion(
    { question_text: emptyHtml, options: standardMcqOptions },
    { stripHtml: true, context: 'publish' }
  );
  assert(
    result.valid === false &&
      result.errors[0]?.code === MCQ_ERROR_CODES.QUESTION_TEXT_REQUIRED,
    `rejects semantically empty question_text: ${emptyHtml}`
  );
}

{
  const richText = validateMcqQuestion(
    {
      question_text: '<p><strong>Capital</strong> of France?</p>',
      options: standardMcqOptions,
    },
    { stripHtml: true, context: 'manual_save' }
  );
  assert(richText.valid === true, 'accepts legitimate rich-text question');
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
