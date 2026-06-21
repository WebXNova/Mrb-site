/**

 * P0 PATCH-3 / P1 PATCH-4 — subject enforcement via testValidation.service.js.

 * Run: node scripts/verify-test-subject-enforcement.mjs

 */

import fs from 'fs';

import path from 'path';

import { fileURLToPath } from 'url';

import {

  assertQuestionSubjectIdAllowed,

  validateTestSubjectIntegrity,

} from '../src/services/testSubjectIntegrity.service.js';

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



function assertNoBypass(label, content) {

  if (/if\s*\(\s*!allowed\.length\s*\)\s*return/.test(content)) {

    throw new Error(`${label}: empty test_subjects bypass still present`);

  }

  console.log(`PASS ${label}`);

}

function assertNoMatch(label, content, pattern) {
  if (pattern.test(content)) throw new Error(`${label}: found ${pattern}`);
  console.log(`PASS ${label}`);
}

const validation = read('src/services/testValidation.service.js');

const integrity = read('src/services/testSubjectIntegrity.service.js');

const composition = read('src/services/testQuestionComposition.service.js');

const lifecycle = read('src/services/testLifecycle.service.js');



assertMatch('validation — NO_SUBJECTS', validation, /NO_SUBJECTS/);

assertMatch('validation — QUESTION_SUBJECT_NOT_ALLOWED', validation, /QUESTION_SUBJECT_NOT_ALLOWED/);

assertMatch('validation — composition', validation, /evaluateSubjectAndLinkComposition/);

assertNoBypass('validation — no silent empty bypass', validation);



assertMatch('integrity delegates', integrity, /testValidation\.service/);

assertMatch('integrity — validateTestComposition', integrity, /validateTestComposition/);



assertMatch('composition — composed loader', composition, /loadComposedTestQuestions/);

assertNoMatch('legacy link service — removed', composition, /listAvailableQuestionsForTest/);



assertMatch('lifecycle publish — publish engine', lifecycle, /testPublishEligibility\.service/);
assertNoMatch('lifecycle — duplicate subject integrity', lifecycle, /validateTestSubjectIntegrity/);



function makeCtx(testType, subjectIds) {

  return {

    testId: 1,

    courseId: 10,

    testType,

    subjectIds,

    allowedSubjectIdSet: new Set(subjectIds),

  };

}



// Case 1 — subject_wise Physics rejects Chemistry

let failed = false;

try {

  assertQuestionSubjectIdAllowed(makeCtx('subject_wise', [1]), 2, 99);

} catch (e) {

  failed = e instanceof AppError && e.errorCode === 'QUESTION_SUBJECT_NOT_ALLOWED';

}

if (!failed) throw new Error('Case 1 failed');

console.log('PASS Case 1 — subject_wise rejects wrong subject');



// Case 2 — mixed Physics+Chemistry rejects Biology

failed = false;

try {

  assertQuestionSubjectIdAllowed(makeCtx('mixed_subject', [1, 2]), 3, 88);

} catch (e) {

  failed = e instanceof AppError && e.errorCode === 'QUESTION_SUBJECT_NOT_ALLOWED';

}

if (!failed) throw new Error('Case 2 failed');

console.log('PASS Case 2 — mixed_subject rejects unlisted subject');



// Case 3 — empty subjects (mock load via direct throw simulation)

failed = false;

try {

  await validateTestSubjectIntegrity(-99999);

} catch (e) {

  failed = e instanceof AppError;

}

if (!failed) throw new Error('Case 3 failed: expected error for missing test');

console.log('PASS Case 3 — missing test rejected');



// Case 5 — valid subject_wise

assertQuestionSubjectIdAllowed(makeCtx('subject_wise', [5]), 5, 10);

console.log('PASS Case 5 — valid subject_wise allowed');



// Case 6 — valid mixed

assertQuestionSubjectIdAllowed(makeCtx('mixed_subject', [1, 2, 3]), 2, 20);

console.log('PASS Case 6 — valid mixed_subject allowed');



console.log('Test subject enforcement verification complete.');

