/**
 * Phase 2 — admin basic-info form mapping for test_access_type.
 * Run: node src/admin/utils/testBasicInfoValidation.test.examples.mjs
 */
import {
  buildTestBasicInfoPayload,
  createDefaultTestBasicInfoForm,
  mapTestToBasicInfoForm,
  validateTestBasicInfoForm,
} from './testBasicInfoValidation.js';

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

console.log('testBasicInfoValidation — test access type\n');

{
  const form = createDefaultTestBasicInfoForm();
  assert(form.test_access_type === 'course_locked', 'Default form is Course Test');
}

{
  const mapped = mapTestToBasicInfoForm({
    courseId: 4,
    title: 'Existing',
    testType: 'subject_wise',
    subjectIds: [1],
  });
  assert(mapped.test_access_type === 'course_locked', 'Existing test maps to course_locked');
}

{
  const form = createDefaultTestBasicInfoForm();
  form.title = 'Course paper';
  form.course_id = '7';
  form.test_type = 'subject_wise';
  form.subject_id = '2';
  const validation = validateTestBasicInfoForm(form, { courseSubjectIds: [2] });
  assert(validation.ok && validation.payload.course_id === 7, 'Course Test still requires a course');
}

{
  const form = createDefaultTestBasicInfoForm();
  form.test_access_type = 'free_standalone';
  form.title = 'Free paper';
  form.test_type = 'subject_wise';
  form.subject_id = '2';
  const validation = validateTestBasicInfoForm(form, { courseSubjectIds: [2] });
  assert(validation.ok && validation.payload.course_id === null, 'Free standalone does not send a course');
}

{
  const form = createDefaultTestBasicInfoForm();
  form.test_access_type = 'paid_standalone';
  form.title = 'Paid paper';
  form.course_id = '99';
  form.test_type = 'subject_wise';
  form.subject_id = '2';
  const payload = buildTestBasicInfoPayload(form);
  assert(payload.course_id === null, 'Paid standalone payload forces course_id null');
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
