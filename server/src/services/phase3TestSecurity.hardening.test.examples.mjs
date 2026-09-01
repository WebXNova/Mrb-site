/**
 * Phase 3 — Test System security & data-integrity (source + unit, no DB).
 * Run: npm run test:phase3-security
 */
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { matchProtectionRule } from '../security/cee/protectionGrid.js';
import { saveStudentAnswerBodySchema } from '../validators/studentAnswerSave.schema.js';
import { parsePositiveTestIdParam } from '../validators/testRules.schema.js';
import { parseStudentAttemptIdParam } from '../validators/studentAttemptLoad.schema.js';
import { isShowAnswersAfterSubmitEnabled, sanitizeGradingDetailItems } from './testResultVisibility.service.js';
import { SUBMIT_RECOVERY_OUTCOMES } from './testSubmitRecovery.service.js';
import { assertAttemptBelongsToStudent } from './studentAttemptLoad.service.js';
import { AttemptNotFoundError } from '../errors/testAttempt/TestAttemptErrors.js';
import { FORBIDDEN_STUDENT_ATTEMPT_LOAD_KEYS } from '../dto/studentAttemptLoad.dto.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.join(__dirname, '..', '..');

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

function mustContain(fileRel, needles, label) {
  const filePath = path.join(serverRoot, fileRel);
  ok(`exists: ${fileRel}`, existsSync(filePath));
  const text = readFileSync(filePath, 'utf8');
  for (const needle of needles) {
    ok(`${label}: "${needle}"`, text.includes(needle));
  }
}

function mustNotContain(fileRel, needles, label) {
  const filePath = path.join(serverRoot, fileRel);
  ok(`exists: ${fileRel}`, existsSync(filePath));
  const text = readFileSync(filePath, 'utf8');
  for (const needle of needles) {
    ok(`${label}: no "${needle}"`, !text.includes(needle));
  }
}

console.log('phase3TestSecurity — ownership, admin, submit, validation, leakage\n');

mustContain(
  'src/services/testAttempt/secureAttemptContext.js',
  ['AND a.user_id = ?', 'FOR UPDATE'],
  '1–4 slug attempt ownership + submit lock'
);
mustContain(
  'src/services/studentAttemptLoad.service.js',
  ['assertAttemptBelongsToStudent', 'AttemptNotFoundError'],
  '1–3 portal load ownership as 404'
);
mustContain(
  'src/services/studentAnswerSave.service.js',
  ['studentOwnsAttempt', 'assertAttemptBelongsToStudent'],
  '3 portal save cannot modify another attempt'
);
mustContain(
  'src/security/cee/ownership/ownershipValidation.js',
  ['assertResultOwnership', 'assertAttemptOwnership'],
  '2 result ownership'
);
mustContain(
  'src/services/testAttempt.service.js',
  ['resolveSecureAttemptContext', 'getAttemptResult'],
  '2–4 slug result uses secure context'
);

mustContain(
  'src/routes/admin.routes.js',
  ["enforcePolicy({ auth: 'admin', maxRisk: 'elevated' })", 'adminSecurityStack', "router.post('/tests/:testId/publish'"],
  '5–6 admin stack + publish route'
);
mustContain(
  'src/controllers/tests.controller.js',
  ['assertTestMutationAccess', "action: 'results_analytics'", 'assertTestReadAccess', 'publishTest'],
  '5–6 / 12 admin read + analytics ownership'
);
mustContain(
  'src/controllers/testQuestions.controller.js',
  ['assertTestReadAccess'],
  '12 composed questions require staff read'
);

{
  const testsRule = matchProtectionRule('/api/tests/demo-slug/verify-code');
  const studentRule = matchProtectionRule('/api/student/tests');
  const resultRule = matchProtectionRule('/api/tests/demo/attempts/9/result');
  ok('7 /api/tests uses entitlement policy', testsRule?.policy === 'entitlement');
  ok('7 /api/student uses entitlement policy', studentRule?.policy === 'entitlement');
  ok('7 result GET uses entitlement policy', resultRule?.policy === 'entitlement');
}

mustContain(
  'src/sql/schema.sql',
  ['UNIQUE KEY uq_attempt_result (attempt_id)', 'UNIQUE KEY uq_attempt_question (attempt_id, question_id)'],
  '8 unique result + answer rows'
);
mustContain(
  'src/services/testSubmitRecovery.service.js',
  ['ALREADY_COMPLETE', 'resolveSubmitAttemptOutcome'],
  '8–9 duplicate submit recovery'
);
ok('8 ALREADY_COMPLETE outcome exists', SUBMIT_RECOVERY_OUTCOMES.ALREADY_COMPLETE === 'already_complete');

mustContain(
  'src/routes/tests.routes.js',
  ['requireCsrf', 'testSubmitRateLimit', 'autosaveRateLimit'],
  '9 CSRF + rate limits on take/submit'
);
mustContain(
  'src/controllers/publicTests.controller.js',
  ['.strict()', 'tokenNonce'],
  '9–10 strict body + attempt nonce on save'
);

{
  ok('10 invalid test id rejected', parsePositiveTestIdParam('abc').ok === false);
  ok('10 negative test id rejected', parsePositiveTestIdParam('-1').ok === false);
  ok('10 invalid attempt id rejected', parseStudentAttemptIdParam('0').ok === false);
  ok('10 extra answer fields rejected', saveStudentAnswerBodySchema.safeParse({
    questionId: 1,
    selectedOptionId: 2,
    isCorrect: true,
  }).success === false);
  ok('10 negative option id rejected', saveStudentAnswerBodySchema.safeParse({
    questionId: 1,
    selectedOptionId: -4,
  }).success === false);
}

{
  const hidden = sanitizeGradingDetailItems(
    [{ questionId: 1, correctOptionText: 'B', explanation: 'secret' }],
    { show_result_immediately: 1, show_answers_after_submit: 0, results_released_at: '2026-01-01T00:00:00.000Z' }
  );
  ok('11 hide-answers omits review payload', hidden == null);
  ok('11 column false is hidden', isShowAnswersAfterSubmitEnabled(0) === false);
  ok(
    '11 load DTO lists forbidden answer keys',
    FORBIDDEN_STUDENT_ATTEMPT_LOAD_KEYS.includes('isCorrect') &&
      FORBIDDEN_STUDENT_ATTEMPT_LOAD_KEYS.includes('explanation')
  );
}

mustContain(
  'src/errors/format/errorResponse.js',
  ['GENERIC_SERVER_MESSAGE', 'isProd && httpStatus >= 500'],
  'prod errors hide stacks'
);

{
  try {
    assertAttemptBelongsToStudent({ id: 99, user_id: 2, student_id: 2 }, 1);
    ok('1 cross-student load throws', false);
  } catch (error) {
    ok('1 cross-student load is 404 not 403', error instanceof AttemptNotFoundError && error.httpStatus === 404);
  }
}

mustNotContain(
  'src/controllers/tests.controller.js',
  ['enrollmentLifecycle', 'entitlement.service', 'safepay'],
  'protected payment/enrollment not imported in tests controller'
);

if (failed) {
  console.error(`\nphase3TestSecurity FAILED ${failed}, passed ${passed}`);
  process.exit(1);
}
console.log(`\nphase3TestSecurity passed ${passed}`);
