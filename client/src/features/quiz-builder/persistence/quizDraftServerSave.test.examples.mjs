/**
 * A2 server save helpers — acceptance tests.
 *
 * Run: npm run test:quiz-draft-server-save
 */
import {
  classifyServerSaveError,
  DRAFT_VERSION_CONFLICT,
  fingerprintDraftPayload,
  serverSaveRetryDelayMs,
} from './quizDraftServerSave.js';

let passed = 0;
let failed = 0;

function ok(label, condition) {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${label}`);
  }
}

console.log('quizDraftServerSave');

ok('conflict classified', classifyServerSaveError({ status: 409, errorCode: DRAFT_VERSION_CONFLICT }).kind === 'conflict');
ok('validation not retryable', classifyServerSaveError({ status: 422, message: 'Invalid' }).retryable === false);
ok('503 retryable', classifyServerSaveError({ status: 503, message: 'unavailable' }).retryable === true);
ok('401 auth', classifyServerSaveError({ status: 401 }).kind === 'auth');

const fp1 = fingerprintDraftPayload({
  testId: 1,
  questions: [{ id: 'q1' }],
  totalPoints: 1,
});
const fp2 = fingerprintDraftPayload({
  testId: 1,
  questions: [{ id: 'q1' }],
  totalPoints: 1,
});
const fp3 = fingerprintDraftPayload({
  testId: 1,
  questions: [{ id: 'q2' }],
  totalPoints: 1,
});
ok('fingerprint stable', fp1 === fp2);
ok('fingerprint changes with content', fp1 !== fp3);
ok('retry backoff increases', serverSaveRetryDelayMs(2) >= serverSaveRetryDelayMs(0));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
