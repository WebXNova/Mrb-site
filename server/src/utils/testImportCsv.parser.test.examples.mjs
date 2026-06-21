/**
 * CSV import parser tests + export round-trip.
 * Run: node src/utils/testImportCsv.parser.test.examples.mjs
 */

import { serializeTestExportCsv } from './testExportCsv.serializer.js';
import { buildTestExportJsonDocument } from './testExportJson.serializer.js';
import {
  detectTestImportFormat,
  parseCsvRows,
  parseTestImportCsv,
  csvRowsToImportPackage,
} from './testImportCsv.parser.js';
import { validateTestImportFile } from '../services/testImportValidation.service.js';
import { TEST_EXPORT_CSV_VERSION } from '../constants/testRichContent.constants.js';

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

console.log('\n[parseCsvRows]');
assert(parseCsvRows('a,b\n"hello, world",x').length === 2, 'parses quoted comma');
assert(parseCsvRows('"line1\nline2",b')[0][0] === 'line1\nline2', 'parses quoted newline');
assert(parseCsvRows('"say ""hi"""')[0][0] === 'say "hi"', 'parses escaped quotes');

console.log('\n[detectTestImportFormat]');
assert(detectTestImportFormat('{"version":"1.0"}') === 'json', 'detects JSON object');
assert(detectTestImportFormat('export_version,title\n1.0,Test') === 'csv', 'detects CSV header');
assert(detectTestImportFormat('  export_version,title') === 'csv', 'detects CSV with leading whitespace');

const exportDocument = buildTestExportJsonDocument({
  test_id: 10,
  course_id: 3,
  subject_ids: [1],
  test: {
    title: 'CSV Round Trip',
    description: 'With, comma',
    category: 'MDCAT',
    test_type: 'mixed_subject',
    duration_minutes: 45,
    passing_marks: 30,
    max_attempts: 2,
    negative_marking: 0,
    shuffle_questions: false,
    shuffle_options: true,
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
      difficulty: 'medium',
      question_type: 'mcq',
      question_html: '<p><strong>Force</strong> equals?</p>',
      question_image_url: null,
      explanation_html: '<p>F = ma</p>',
      marks: 1,
      options: [
        { option_key: 'A', option_html: '<p>ma</p>', image_url: null, is_correct: true, sort_order: 0 },
        { option_key: 'B', option_html: '<p>mv</p>', image_url: null, is_correct: false, sort_order: 1 },
        { option_key: 'C', option_html: '<p>m/a</p>', image_url: null, is_correct: false, sort_order: 2 },
        { option_key: 'D', option_html: '<p>none</p>', image_url: null, is_correct: false, sort_order: 3 },
      ],
      correct_answer: 'A',
    },
  ],
});

console.log('\n[CSV export → parseTestImportCsv]');
const csvText = serializeTestExportCsv(exportDocument);
const parsed = parseTestImportCsv(csvText);
assert(parsed.ok === true, 'parseTestImportCsv succeeds on exported CSV');
if (parsed.ok) {
  assert(parsed.package.test.title === 'CSV Round Trip', 'preserves test title');
  assert(parsed.package.questions.length === 1, 'preserves question count');
  assert(parsed.package.questions[0].question_html.includes('<strong>'), 'preserves HTML in stem');
  assert(parsed.package.questions[0].options[0].is_correct === true, 'preserves correct answer flag');
}

console.log('\n[validateTestImportFile CSV round-trip]');
const validation = await validateTestImportFile(csvText, 3, 'csv');
assert(validation.valid === true, 'CSV export passes full import validation');
assert(validation.format === 'csv', 'reports csv format');
if (validation.valid) {
  const prepared = validation.preparedQuestions[0].prepared;
  assert(prepared.question_html.includes('<strong>'), 'validation preserves rich HTML');
}

console.log('\n[reject bad CSV version]');
const badRows = parseCsvRows(csvText);
badRows[1][0] = '9.9';
const badCsv = badRows.map((row) => row.map((cell) => (String(cell).includes(',') ? `"${cell}"` : cell)).join(',')).join('\n');
const badParsed = csvRowsToImportPackage(parseCsvRows(badCsv));
assert(badParsed.ok === false && badParsed.code === 'UNSUPPORTED_SCHEMA_VERSION', 'rejects unsupported CSV version');

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
