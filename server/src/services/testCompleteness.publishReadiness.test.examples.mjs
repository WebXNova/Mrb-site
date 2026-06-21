/**
 * G-03 — completeness must not report publish-ready without a valid quiz draft.
 *
 * Run: node src/services/testCompleteness.publishReadiness.test.examples.mjs
 */
import {
  evaluateTestCompleteness,
  resolveWizardQuestionCount,
  TEST_LIFECYCLE_STATES,
} from './testCompleteness.service.js';
import { QUESTION_AUTHORITY_SOURCES } from './testQuestionAuthority.service.js';

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

const completeWizardRow = {
  status: 'DRAFT',
  course_id: 1,
  title: 'Valid Test Title',
  test_type: 'subject_wise',
  category: 'MDCAT',
  duration_minutes: 30,
  max_attempts: 2,
  access_mode: 'private',
};

console.log('testCompleteness.publishReadiness — G-03\n');

{
  const report = evaluateTestCompleteness(
    completeWizardRow,
    5,
    'publish',
    [1],
    {
      source: QUESTION_AUTHORITY_SOURCES.RUNTIME_COMPOSED,
      questionCount: 5,
      runtimeComposedCount: 5,
      draftQuestionCount: 0,
      hasQuizDraft: false,
    }
  );
  assert(report.step4_complete === false, 'legacy runtime links alone do not complete step 4');
  assert(report.can_publish === false, 'no draft — can_publish is false');
  assert(report.missing_fields.includes('quiz_draft'), 'missing_fields includes quiz_draft');
  assert(report.question_count === 0, 'wizard question_count ignores legacy runtime links');
  assert(report.lifecycle_status !== TEST_LIFECYCLE_STATES.READY_FOR_PUBLISH, 'not READY_FOR_PUBLISH without draft');
}

{
  const report = evaluateTestCompleteness(
    completeWizardRow,
    0,
    'publish',
    [1],
    {
      source: QUESTION_AUTHORITY_SOURCES.QUIZ_DRAFT,
      questionCount: 0,
      runtimeComposedCount: 0,
      draftQuestionCount: 0,
      draftTotalCount: 0,
      hasQuizDraft: true,
    }
  );
  assert(report.step4_complete === false, 'empty draft does not complete step 4');
  assert(report.can_publish === false, 'empty draft — can_publish is false');
  assert(report.missing_fields.includes('questions'), 'missing_fields includes questions');
  assert(report.has_quiz_draft === true, 'has_quiz_draft exposed when draft row exists');
}

{
  const report = evaluateTestCompleteness(
    completeWizardRow,
    2,
    'publish',
    [1],
    {
      source: QUESTION_AUTHORITY_SOURCES.QUIZ_DRAFT,
      questionCount: 2,
      runtimeComposedCount: 0,
      draftQuestionCount: 2,
      draftTotalCount: 2,
      hasQuizDraft: true,
    }
  );
  assert(report.step4_complete === true, 'valid draft with questions completes step 4');
  assert(report.can_publish === true, 'valid draft — can_publish is true');
  assert(report.question_count === 2, 'question_count uses draft valid count');
  assert(report.lifecycle_status === TEST_LIFECYCLE_STATES.READY_FOR_PUBLISH, 'READY_FOR_PUBLISH with valid draft');
}

{
  const published = evaluateTestCompleteness(
    { ...completeWizardRow, status: 'published' },
    4,
    'general',
    [1],
    {
      source: QUESTION_AUTHORITY_SOURCES.RUNTIME_COMPOSED,
      questionCount: 4,
      runtimeComposedCount: 4,
      hasQuizDraft: false,
    }
  );
  assert(published.step4_complete === true, 'published tests use runtime composed count');
  assert(resolveWizardQuestionCount({ status: 'published' }, { questionCount: 4 }) === 4, 'resolveWizardQuestionCount for published');
}

{
  const wizard = evaluateTestCompleteness(
    completeWizardRow,
    3,
    'publish',
    [1],
    {
      source: QUESTION_AUTHORITY_SOURCES.RUNTIME_COMPOSED,
      questionCount: 3,
      runtimeComposedCount: 3,
      hasQuizDraft: false,
    }
  );
  assert(wizard.can_publish === false, 'publish context completeness false without draft');
  assert(wizard.missing_fields.includes('quiz_draft'), 'publish context surfaces quiz_draft missing');
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
