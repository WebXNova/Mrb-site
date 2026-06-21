/**
 * P1 PATCH-4 — centralized test validation core verification.
 * Run: node scripts/verify-test-validation-core.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  validateTestState,
  validateTestComposition,
  buildValidationReport,
} from '../src/services/testValidation.service.js';
import { AppError } from '../src/errors/base/AppError.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(serverRoot, rel), 'utf8');
}

function assertMatch(label, content, pattern) {
  if (!pattern.test(content)) throw new Error(`${label}: missing ${pattern}`);
  console.log(`PASS ${label}`);
}

function assertNoMatch(label, content, pattern) {
  if (pattern.test(content)) throw new Error(`${label}: found ${pattern}`);
  console.log(`PASS ${label}`);
}

const validation = read('src/services/testValidation.service.js');
const lifecycle = read('src/services/testLifecycle.service.js');
const testService = read('src/services/test.service.js');
const composition = read('src/services/testQuestionComposition.service.js');
const subjectIntegrity = read('src/services/testSubjectIntegrity.service.js');

assertMatch('validation module', validation, /export function validateTestState/);
assertMatch('validation module', validation, /export async function validateTestComposition/);
const publishEngine = read('src/services/testPublishEligibility.service.js');
assertMatch('publish engine', publishEngine, /export async function validatePublishEligibility/);
assertMatch('validation module', validation, /export function buildValidationReport/);
assertMatch('validation — MDCAT', validation, /INVALID_CATEGORY/);
assertMatch('validation — NO_SUBJECTS', validation, /NO_SUBJECTS/);

assertNoMatch('lifecycle — duplicate publish validation', lifecycle, /validateTestSubjectIntegrity/);
assertMatch('lifecycle — delegates publish engine', lifecycle, /testPublishEligibility\.service/);

assertMatch('test.service — getTestCompletenessReport import', testService, /getTestCompletenessReport/);
assertMatch(
  'test.service — getTestCompletenessReport used in settings',
  testService,
  /getTestCompletenessReport\(Number\(testId\)\)/
);
assertMatch('test.service — completeness init guard', testService, /Test completeness service failed to initialize/);
assertMatch('test.service — enforceWizardWrite', testService, /enforceWizardWrite/);
assertNoMatch('test.service — assertWizardStepUpdateAllowed', testService, /assertWizardStepUpdateAllowed/);
assertMatch('test.service — validatePublishEligibility', testService, /validatePublishEligibility/);
assertMatch('test.service — publish engine import', testService, /from '\.\/testPublishEligibility\.service\.js'/);

assertMatch('composition — runtime composed loader', composition, /loadComposedTestQuestions/);
assertNoMatch('legacy link service — removed', composition, /linkQuestionsToTestBulk/);

assertMatch('subject integrity delegates', subjectIntegrity, /testValidation\.service/);

// Case: invalid category
const badCategory = validateTestState({
  course_id: 1,
  title: 'Valid Title',
  category: 'ECAT',
  test_type: 'subject_wise',
  status: 'INCOMPLETE',
});
if (badCategory.valid || !badCategory.errors.includes('INVALID_CATEGORY')) {
  throw new Error('invalid category should fail');
}
console.log('PASS Case — invalid category → INVALID_CATEGORY');

// Case: invalid test type
const badType = validateTestState({
  course_id: 1,
  title: 'Valid Title',
  category: 'MDCAT',
  test_type: 'invalid_type',
});
if (badType.valid) throw new Error('invalid test_type should fail');
console.log('PASS Case — invalid test_type');

// Case: valid state
const good = validateTestState({
  course_id: 1,
  title: 'Valid Title',
  category: 'MDCAT',
  test_type: 'subject_wise',
  status: 'INCOMPLETE',
});
if (!good.valid) throw new Error('valid state should pass');
console.log('PASS Case — valid test state');

// Case 3 — missing test returns invalid report (non-throwing by default)
const missingComposition = await validateTestComposition(-99999);
if (missingComposition.valid) throw new Error('Case 3: missing test should be invalid');
console.log('PASS Case 3 — composition rejects missing test');

let rejected = false;
try {
  await validateTestComposition(-99999, undefined, { throwOnFailure: true });
} catch (e) {
  rejected = e instanceof AppError;
}
if (!rejected) throw new Error('Case 3b: throwOnFailure should throw');
console.log('PASS Case 3b — composition throwOnFailure');

// Case — structured report
const report = buildValidationReport(false, ['NO_SUBJECTS', 'NO_QUESTIONS']);
if (report.valid || !report.errors.includes('NO_SUBJECTS')) {
  throw new Error('buildValidationReport failed');
}
console.log('PASS Case — structured validation report');

// Case — missing course_id
const noCourse = validateTestState({
  title: 'Valid Title',
  category: 'MDCAT',
  test_type: 'subject_wise',
});
if (noCourse.valid || !noCourse.errors.includes('INVALID_TEST_STATE')) {
  throw new Error('missing course_id should fail INVALID_TEST_STATE');
}
console.log('PASS Case — missing course_id');

console.log('Test validation core verification complete.');
