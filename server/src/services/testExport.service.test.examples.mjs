/**
 * TestExportService unit tests (no DB).
 * Run: node src/services/testExport.service.test.examples.mjs
 */

import { TEST_EXPORT_JSON_VERSION } from '../constants/testRichContent.constants.js';
import { buildRichContentExportPackage, buildTestExportDocument } from './testExport.service.js';

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

const loadedFixture = {
  test: {
    id: 42,
    course_id: 7,
    title: 'Physics Test',
    description: 'Chapter 1',
    category: 'MDCAT',
    test_type: 'mixed_subject',
    duration_minutes: 45,
    passing_marks: 20,
    max_attempts: 2,
    negative_marking: 0.25,
    shuffle_questions: 1,
    shuffle_options: 0,
    show_explanations: 1,
    show_result_immediately: 1,
    show_answers_after_submit: 0,
    allow_retake: 0,
    access_mode: 'private',
    tags_json: '["physics","chapter-1"]',
  },
  subjectIds: [3, 5],
  linkRows: [
    {
      display_order: 0,
      marks_override: null,
      topic: 'Mechanics',
      difficulty: 'medium',
      question_type: 'mcq',
      question_text: '<p>Legacy stem</p>',
      question_html: '<p><strong>Rich stem</strong></p>',
      question_image_url: '/api/uploads/question-bank/abc12345678901234567890123456789012345678901234.webp',
      explanation: null,
      explanation_html: '<p>Rich explanation</p>',
      marks: 2,
      question_id: 101,
    },
  ],
  optionsByQuestion: new Map([
    [
      101,
      [
        {
          option_key: 'A',
          option_text: '<p>Legacy A</p>',
          option_html: '<p><em>Rich A</em></p>',
          image_url: null,
          is_correct: 1,
          sort_order: 0,
        },
        {
          option_key: 'B',
          option_text: '<p>B</p>',
          option_html: '<p>B</p>',
          image_url: null,
          is_correct: 0,
          sort_order: 1,
        },
        {
          option_key: 'C',
          option_text: '<p>C</p>',
          option_html: '<p>C</p>',
          image_url: null,
          is_correct: 0,
          sort_order: 2,
        },
        {
          option_key: 'D',
          option_text: '<p>D</p>',
          option_html: '<p>D</p>',
          image_url: null,
          is_correct: 0,
          sort_order: 3,
        },
      ],
    ],
  ]),
};

console.log('\n[buildTestExportDocument v1.0]');
const doc = buildTestExportDocument({
  ...loadedFixture,
  testId: 42,
  courseId: 7,
});

assert(doc.version === TEST_EXPORT_JSON_VERSION, 'version is 1.0 string');
assert(doc.test_id === 42, 'includes test_id');
assert(doc.course_id === 7, 'includes course_id');
assert(doc.test.title === 'Physics Test', 'exports test title');
assert(doc.test.passing_marks === 20, 'exports passing marks');
assert(doc.test.show_explanations === true, 'exports settings flags');
assert(doc.subject_ids.length === 2, 'exports subject ids');
assert(doc.questions.length === 1, 'exports one question');

const q = doc.questions[0];
assert(q.question_html.includes('<strong>'), 'prefers question_html');
assert(q.explanation_html.includes('Rich explanation'), 'exports explanation_html');
assert(q.correct_answer === 'A', 'includes correct_answer');
assert(q.options[0].option_html.includes('<em>'), 'prefers option_html');

console.log('\n[legacy buildRichContentExportPackage]');
const legacy = buildRichContentExportPackage(loadedFixture);
assert(legacy.format === 'mrb_test_rich_v1', 'legacy format preserved');
assert(legacy.questions[0].question_html.includes('<strong>'), 'legacy package has rich html');

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
