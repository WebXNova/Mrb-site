/**
 * TestImportValidationService tests.
 * Run: node src/services/testImportValidation.service.test.examples.mjs
 */

import {
  MAX_IMPORT_PAYLOAD_BYTES,
  RICH_CONTENT_FORMAT,
  RICH_CONTENT_FORMAT_VERSION,
} from '../constants/testRichContent.constants.js';
import {
  parseImportJsonPayload,
  validateImportPayloadSize,
  validateRichContentImportPayload,
  validateRichContentPackageStructure,
} from './testImportValidation.service.js';

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

function buildValidPackage(overrides = {}) {
  const baseQuestion = {
    display_order: 0,
    marks: 1,
    question_html: '<p><strong>What is 2+2?</strong></p>',
    options: [
      { option_key: 'A', option_html: '<p>4</p>', is_correct: true, sort_order: 0 },
      { option_key: 'B', option_html: '<p>5</p>', is_correct: false, sort_order: 1 },
      { option_key: 'C', option_html: '<p>6</p>', is_correct: false, sort_order: 2 },
      { option_key: 'D', option_html: '<p>7</p>', is_correct: false, sort_order: 3 },
    ],
  };

  return {
    format_version: RICH_CONTENT_FORMAT_VERSION,
    format: RICH_CONTENT_FORMAT,
    exported_at: new Date().toISOString(),
    test: {
      title: 'Sample Test',
      duration_minutes: 30,
      passing_marks: 10,
      max_attempts: 1,
    },
    subject_ids: [],
    questions: [baseQuestion],
    ...overrides,
  };
}

console.log('\n[payload size]');
assert(validateImportPayloadSize('').ok === false, 'rejects empty payload');
assert(
  validateImportPayloadSize('x'.repeat(MAX_IMPORT_PAYLOAD_BYTES + 1)).ok === false,
  'rejects oversized payload'
);

console.log('\n[json parse]');
assert(parseImportJsonPayload('{bad json').ok === false, 'rejects corrupt JSON');
assert(parseImportJsonPayload('[]').ok === false, 'rejects JSON array root');
assert(parseImportJsonPayload(buildValidPackage()).ok === true, 'accepts object payload');

console.log('\n[structure]');
const valid = buildValidPackage();
assert(validateRichContentPackageStructure(valid).ok === true, 'valid package passes structure');

const missingOptions = buildValidPackage({
  questions: [{ display_order: 0, marks: 1, question_html: '<p>Q</p>', options: [] }],
});
assert(validateRichContentPackageStructure(missingOptions).ok === false, 'rejects question without 4 options');

console.log('\n[security — malformed HTML]');
const xssPackage = buildValidPackage({
  questions: [
    {
      display_order: 0,
      marks: 1,
      question_html: '<p>Safe</p><script>alert(1)</script>',
      options: [
        { option_key: 'A', option_html: '<p>A</p>', is_correct: true, sort_order: 0 },
        { option_key: 'B', option_html: '<p>B</p>', is_correct: false, sort_order: 1 },
        { option_key: 'C', option_html: '<p>C</p>', is_correct: false, sort_order: 2 },
        { option_key: 'D', option_html: '<p>D</p>', is_correct: false, sort_order: 3 },
      ],
    },
  ],
});
const xssResult = validateRichContentImportPayload(xssPackage, 1);
assert(xssResult.ok === true, 'sanitized XSS in question passes validation');
if (xssResult.ok) {
  assert(
    !xssResult.preparedQuestions[0].prepared.question_text.includes('<script>'),
    'script tag stripped from prepared question'
  );
  assert(
    xssResult.preparedQuestions[0].prepared.question_text.includes('<strong>') ||
      xssResult.preparedQuestions[0].prepared.question_text.includes('Safe'),
    'safe content preserved'
  );
}

console.log('\n[rich formatting preserved]');
const richPackage = buildValidPackage();
const richResult = validateRichContentImportPayload(richPackage, 1);
assert(richResult.ok === true, 'rich package validates');
if (richResult.ok) {
  assert(
    richResult.preparedQuestions[0].prepared.question_html.includes('<strong>'),
    'bold formatting preserved in question_html'
  );
  assert(
    richResult.preparedQuestions[0].prepared.options[0].option_html.includes('<p>'),
    'option HTML preserved'
  );
}

console.log('\n[invalid structure]');
const noCorrect = buildValidPackage({
  questions: [
    {
      display_order: 0,
      marks: 1,
      question_html: '<p>Q</p>',
      options: [
        { option_key: 'A', option_html: '<p>A</p>', is_correct: false, sort_order: 0 },
        { option_key: 'B', option_html: '<p>B</p>', is_correct: false, sort_order: 1 },
        { option_key: 'C', option_html: '<p>C</p>', is_correct: false, sort_order: 2 },
        { option_key: 'D', option_html: '<p>D</p>', is_correct: false, sort_order: 3 },
      ],
    },
  ],
});
assert(validateRichContentImportPayload(noCorrect, 1).ok === false, 'rejects zero correct options');

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
