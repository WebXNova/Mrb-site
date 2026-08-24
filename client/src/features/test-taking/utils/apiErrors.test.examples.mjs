/**
 * Attempt submit error classification — distinct timeout / token / student-auth messages.
 *
 * Run: node src/features/test-taking/utils/apiErrors.test.examples.mjs
 */
import assert from 'node:assert/strict';

import {
  getSubmitErrorMessage,
  isAttemptExpiredError,
  isAttemptTokenError,
  isStudentAuthError,
} from './apiErrors.js';

const TIME_RAN_OUT =
  "Time ran out. Your answers were saved, but submission wasn't accepted in time.";
const SESSION_INTERRUPTED =
  'Your test session was interrupted. Please return to the test start page to resume.';

function expiredErr() {
  return { status: 410, errorCode: 'ATTEMPT_EXPIRED', message: 'This test attempt has expired.' };
}

function tokenErr() {
  return {
    status: 401,
    errorCode: 'ATTEMPT_TOKEN_INVALID',
    message: 'Attempt token is invalid or has been rotated.',
  };
}

function studentAuthErr() {
  return { status: 401, errorCode: 'AUTH_REQUIRED', message: 'Authentication required.' };
}

assert.equal(isAttemptExpiredError(expiredErr()), true);
assert.equal(isAttemptTokenError(expiredErr()), false);
assert.equal(getSubmitErrorMessage(expiredErr()), TIME_RAN_OUT);

assert.equal(isAttemptTokenError(tokenErr()), true);
assert.equal(isAttemptExpiredError(tokenErr()), false);
assert.equal(isStudentAuthError(tokenErr()), false);
assert.equal(getSubmitErrorMessage(tokenErr()), SESSION_INTERRUPTED);

assert.equal(isStudentAuthError(studentAuthErr()), true);
assert.equal(isAttemptTokenError(studentAuthErr()), false);
assert.equal(isAttemptExpiredError(studentAuthErr()), false);
assert.match(getSubmitErrorMessage(studentAuthErr()), /sign in again/i);

const genericExpired401 = { status: 401, message: 'Session expired' };
assert.equal(isAttemptTokenError(genericExpired401), false);
assert.equal(isStudentAuthError(genericExpired401), true);
assert.match(getSubmitErrorMessage(genericExpired401), /login session expired/i);

const conflictExpired = { status: 409, errorCode: 'ATTEMPT_EXPIRED', message: 'This test attempt has expired.' };
assert.equal(isAttemptExpiredError(conflictExpired), true);
assert.equal(getSubmitErrorMessage(conflictExpired), TIME_RAN_OUT);

console.log('apiErrors attempt-session classification: all assertions passed');
