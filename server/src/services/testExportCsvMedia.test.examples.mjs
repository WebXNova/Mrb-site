/**
 * CSV media inline / rematerialize tests.
 * Run: node src/services/testExportCsvMedia.test.examples.mjs
 */

import {
  collectCsvImportDataUris,
  extractDataUrisFromValue,
  inlineMediaInExportDocument,
} from './testExportCsvMedia.service.js';
import { serializeTestExportCsv } from '../utils/testExportCsv.serializer.js';
import { parseTestImportCsv } from '../utils/testImportCsv.parser.js';
import { buildTestExportJsonDocument } from '../utils/testExportJson.serializer.js';

const TINY_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const TINY_PNG_DATA_URI = `data:image/png;base64,${TINY_PNG_B64}`;

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

console.log('\n[extractDataUrisFromValue]');
assert(extractDataUrisFromValue('').length === 0, 'empty string returns no URIs');
assert(
  extractDataUrisFromValue(`<img src="${TINY_PNG_DATA_URI}"/>`).length === 1,
  'extracts data URI from img src'
);
assert(
  extractDataUrisFromValue('<p><strong>Bold</strong></p>').length === 0,
  'plain HTML without images returns no URIs'
);

console.log('\n[collectCsvImportDataUris]');
const pkgWithEmbedded = {
  questions: [
    {
      question_html: `<p><b>What is Physics?</b> <img src="${TINY_PNG_DATA_URI}"/></p>`,
      explanation_html: '<span style="color:red;">Physics is...</span>',
      question_image_url: null,
      options: [
        {
          option_key: 'A',
          option_html: `<img src="${TINY_PNG_DATA_URI}"/> Newton`,
          image_url: null,
          is_correct: true,
        },
        { option_key: 'B', option_html: '<i>Einstein</i>', image_url: null, is_correct: false },
      ],
    },
  ],
};
const collected = collectCsvImportDataUris(pkgWithEmbedded);
assert(collected.size === 1, 'deduplicates identical embedded data URIs');

console.log('\n[inlineMediaInExportDocument — no upload URLs]');
const plainDoc = buildTestExportJsonDocument({
  test_id: 1,
  course_id: 1,
  subject_ids: [],
  test: {
    title: 'Plain',
    duration_minutes: 30,
    passing_marks: 0,
    max_attempts: 1,
  },
  questions: [
    {
      display_order: 0,
      question_html: '<p><strong>Force</strong></p>',
      explanation_html: '<p>F = ma</p>',
      marks: 1,
      options: [
        { option_key: 'A', option_html: '<p>ma</p>', is_correct: true, sort_order: 0 },
        { option_key: 'B', option_html: '<p>mv</p>', is_correct: false, sort_order: 1 },
        { option_key: 'C', option_html: '<p>m/a</p>', is_correct: false, sort_order: 2 },
        { option_key: 'D', option_html: '<p>none</p>', is_correct: false, sort_order: 3 },
      ],
    },
  ],
});
const inlined = await inlineMediaInExportDocument(plainDoc);
assert(inlined.inlined_count === 0, 'no upload URLs means zero inlined images');
assert(
  inlined.document.questions[0].question_html.includes('<strong>'),
  'preserves bold HTML when no images to inline'
);

console.log('\n[CSV round-trip with embedded HTML formatting]');
const richDoc = buildTestExportJsonDocument({
  test_id: 99,
  course_id: 2,
  subject_ids: [1],
  test: {
    title: 'Rich CSV Test',
    description: 'Desc',
    category: 'MDCAT',
    test_type: 'mixed_subject',
    duration_minutes: 60,
    passing_marks: 40,
    max_attempts: 1,
    negative_marking: 0,
    shuffle_questions: false,
    shuffle_options: false,
    show_explanations: true,
    show_result_immediately: true,
    show_answers_after_submit: false,
    allow_retake: false,
    access_mode: 'private',
    tags: [],
  },
  questions: [
    {
      display_order: 0,
      marks_override: null,
      topic: 'Physics',
      difficulty: 'easy',
      question_type: 'mcq',
      question_html: '<b>What is Physics?</b>',
      question_image_url: null,
      explanation_html: '<span style="color:red;">Physics is...</span>',
      marks: 1,
      options: [
        { option_key: 'A', option_html: `<img src="${TINY_PNG_DATA_URI}"/> Newton`, image_url: null, is_correct: true, sort_order: 0 },
        { option_key: 'B', option_html: '<i>Einstein</i>', image_url: null, is_correct: false, sort_order: 1 },
        { option_key: 'C', option_html: 'E=mc²', image_url: null, is_correct: false, sort_order: 2 },
        { option_key: 'D', option_html: '<u>Quantum</u>', image_url: null, is_correct: false, sort_order: 3 },
      ],
      correct_answer: 'A',
    },
  ],
});

const csvText = serializeTestExportCsv(richDoc);
const parsed = parseTestImportCsv(csvText);
assert(parsed.ok === true, 'CSV with rich HTML parses successfully');
if (parsed.ok) {
  assert(parsed.package.questions[0].question_html.includes('<b>'), 'preserves bold in question');
  assert(parsed.package.questions[0].options[1].option_html.includes('<i>'), 'preserves italic in option');
  assert(parsed.package.questions[0].options[0].option_html.includes('data:image/png;base64,'), 'preserves embedded base64 image in option');
  assert(parsed.package.questions[0].explanation_html.includes('color:red'), 'preserves inline styles in explanation');
  const urisAfterParse = collectCsvImportDataUris(parsed.package);
  assert(urisAfterParse.size === 1, 'import package retains embedded data URI for rematerialization');
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
