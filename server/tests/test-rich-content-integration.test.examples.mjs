/**
 * Rich-content test import/export integration-style tests (no live DB).
 * Validates round-trip export → import validation preserves rich HTML.
 *
 * Run: node tests/test-rich-content-integration.test.examples.mjs
 */

import { buildTestExportDocument } from '../src/services/testExport.service.js';
import { validateRichContentImportPayload } from '../src/services/testImportValidation.service.js';
import { previewRichContentImport } from '../src/services/testImport.service.js';
import { TEST_EXPORT_JSON_VERSION } from '../src/constants/testRichContent.constants.js';

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

const exportFixture = {
  test: {
    title: 'Round Trip Test',
    description: null,
    category: 'MDCAT',
    test_type: 'subject_wise',
    duration_minutes: 60,
    passing_marks: 40,
    max_attempts: 1,
    negative_marking: 0,
    shuffle_questions: 0,
    shuffle_options: 0,
    show_explanations: 1,
    show_result_immediately: 1,
    show_answers_after_submit: 0,
    allow_retake: 0,
    access_mode: 'private',
    tags_json: '[]',
  },
  subjectIds: [1],
  linkRows: [
    {
      display_order: 0,
      marks_override: 2,
      topic: 'Bio',
      difficulty: 'easy',
      question_type: 'mcq',
      question_text: '<p>Plain</p>',
      question_html: '<p><strong>Rich stem</strong> with <u>underline</u></p>',
      question_image_url: null,
      explanation: null,
      explanation_html: '<p>Because <strong>science</strong></p>',
      marks: 2,
      question_id: 55,
    },
  ],
  optionsByQuestion: new Map([
    [
      55,
      ['A', 'B', 'C', 'D'].map((key, index) => ({
        option_key: key,
        option_text: `<p>${key} plain</p>`,
        option_html: `<p><strong>${key}</strong> rich</p>`,
        image_url: null,
        is_correct: index === 0 ? 1 : 0,
        sort_order: index,
      })),
    ],
  ]),
};

console.log('\n[export → import validation round-trip v1.0]');
const exported = buildTestExportDocument({
  test: exportFixture.test,
  subjectIds: exportFixture.subjectIds,
  linkRows: exportFixture.linkRows,
  optionsByQuestion: exportFixture.optionsByQuestion,
  testId: 99,
  courseId: 1,
});
assert(exported.version === TEST_EXPORT_JSON_VERSION, 'export version is 1.0');

const validation = validateRichContentImportPayload(exported, 1);
assert(validation.ok === true, 'exported package passes import validation');

if (validation.ok) {
  const prepared = validation.preparedQuestions[0].prepared;
  assert(prepared.question_html.includes('<strong>'), 'round-trip preserves bold in question');
  assert(prepared.question_html.includes('<u>'), 'round-trip preserves underline in question');
  assert(prepared.explanation_html.includes('<strong>'), 'round-trip preserves explanation formatting');
  assert(prepared.options[0].option_html.includes('<strong>A</strong>'), 'round-trip preserves option formatting');
}

console.log('\n[preview API contract]');
const preview = await previewRichContentImport(exported, 1);
assert(preview.valid === true, 'preview accepts exported package');
assert(preview.question_count === 1, 'preview reports question count');
assert(preview.title === 'Round Trip Test', 'preview reports title');

console.log('\n[reject tampered version]');
const tampered = { ...exported, version: '9.9' };
assert(validateRichContentImportPayload(tampered, 1).ok === false, 'rejects unknown version');

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
