/**
 * CSV export serializer tests.
 * Run: node src/utils/testExportCsv.serializer.test.examples.mjs
 */

import {
  CSV_UTF8_BOM,
  escapeCsvField,
  formatCsvRow,
  serializeTestExportCsv,
  serializeTestExportCsvBuffer,
} from './testExportCsv.serializer.js';
import { buildTestExportJsonDocument } from './testExportJson.serializer.js';

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

console.log('\n[escapeCsvField]');
assert(escapeCsvField(null) === '', 'null becomes empty string');
assert(escapeCsvField('plain') === 'plain', 'plain text unchanged');
assert(escapeCsvField('hello, world') === '"hello, world"', 'commas trigger quoting');
assert(escapeCsvField('say "hi"') === '"say ""hi"""', 'quotes are doubled');
assert(
  escapeCsvField('<p><strong>Rich</strong></p>') === '<p><strong>Rich</strong></p>',
  'raw HTML preserved without encoding'
);
assert(
  escapeCsvField('line1\nline2') === '"line1\nline2"',
  'newlines trigger quoting'
);

console.log('\n[serializeTestExportCsv]');
const document = buildTestExportJsonDocument({
  test_id: 42,
  course_id: 7,
  subject_ids: [1, 2],
  test: {
    title: 'Sample, "Quoted" Test',
    description: 'Desc with, comma',
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
    tags: ['tag1'],
  },
  questions: [
    {
      display_order: 0,
      marks_override: null,
      topic: 'Bio',
      difficulty: 'easy',
      question_type: 'mcq',
      question_html: '<p><strong>Stem</strong></p>',
      question_image_url: '/api/uploads/question-bank/abc12345678901234567890123456789012345678901234.webp',
      explanation_html: '<p>Because</p>',
      marks: 2,
      options: [
        { option_key: 'A', option_html: '<p>A</p>', image_url: null, is_correct: true, sort_order: 0 },
        { option_key: 'B', option_html: '<p>B</p>', image_url: null, is_correct: false, sort_order: 1 },
        { option_key: 'C', option_html: '<p>C</p>', image_url: null, is_correct: false, sort_order: 2 },
        { option_key: 'D', option_html: '<p>D</p>', image_url: null, is_correct: false, sort_order: 3 },
      ],
    },
  ],
});

const csv = serializeTestExportCsv(document);
assert(csv.startsWith(CSV_UTF8_BOM), 'includes UTF-8 BOM for Excel');
assert(csv.includes('question_html'), 'includes header row');
assert(csv.includes('<p><strong>Stem</strong></p>'), 'preserves raw HTML in body');
assert(csv.includes('Sample, ""Quoted"" Test') || csv.includes('"Sample, ""Quoted"" Test"'), 'escapes commas/quotes in title');

const buffer = serializeTestExportCsvBuffer(document);
assert(Buffer.isBuffer(buffer), 'buffer export returns Buffer');
assert(buffer.byteLength > 100, 'buffer has content');

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
