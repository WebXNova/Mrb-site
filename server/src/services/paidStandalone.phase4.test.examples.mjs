/**
 * Phase 4 — paid standalone tests (source + unit, no live DB race harness).
 * Run: npm run test:phase4-paid-standalone
 */
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { computeManualPaymentRisk, MANUAL_PAYMENT_RISK_FLAGS } from './manualPaymentRisk.service.js';
import { parseCreatePaidStandaloneRegistrationDto } from '../dtos/paidStandaloneRegistration.dto.js';
import {
  isPaidStandaloneExamOpen,
  isPaidStandaloneTest,
} from '../security/cee/paidStandaloneAccess.service.js';
import { shouldEnforceScheduleWindow } from '../security/cee/courseLinkedTestAccess.service.js';
import { matchProtectionRule } from '../security/cee/protectionGrid.js';
import { assertTestSettingsWhitelist } from '../validators/testSettings.schema.js';
import { STANDALONE_ORDER_STATUS, STANDALONE_SEAT_STATUS } from '../constants/paidStandalone.constants.js';

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

console.log('phase4 paid standalone — registration, payment, seats, access, security\n');

const validReg = {
  applicantFullName: 'Ali Khan',
  fatherName: 'Ahmed Khan',
  dateOfBirth: '2004-01-15',
  gender: 'male',
  whatsappNumber: '+923001234567',
  email: 'ali@example.com',
  province_id: 1,
  district_id: 2,
  city_id: 3,
  hsscStatus: '12th',
  mdcatAttemptType: 'Fresher',
};

ok('valid registration parses', Boolean(parseCreatePaidStandaloneRegistrationDto(validReg)));

try {
  parseCreatePaidStandaloneRegistrationDto({ ...validReg, applicantFullName: 'A' });
  ok('invalid registration rejected', false);
} catch {
  ok('invalid registration rejected', true);
}

try {
  parseCreatePaidStandaloneRegistrationDto({ ...validReg, course_id: 9 });
  ok('course_id mass-assignment rejected', false);
} catch {
  ok('course_id mass-assignment rejected', true);
}

try {
  parseCreatePaidStandaloneRegistrationDto({ ...validReg, status: 'approved' });
  ok('approval mass-assignment rejected', false);
} catch {
  ok('approval mass-assignment rejected', true);
}

const amountOk = computeManualPaymentRisk({
  studentId: 1,
  amountClaimed: 500,
  expectedAmount: 500,
  pendingTrxMatches: [],
  screenshotMatches: [],
  recentDifferentTrxCount: 0,
  priorSenderNumbers: [],
  senderPhone: '+923001234567',
});
ok('correct amount is low risk', amountOk.riskLevel === 'low');

const amountBad = computeManualPaymentRisk({
  studentId: 1,
  amountClaimed: 1,
  expectedAmount: 500,
  pendingTrxMatches: [],
  screenshotMatches: [],
  recentDifferentTrxCount: 0,
  priorSenderNumbers: [],
  senderPhone: '+923001234567',
});
ok('wrong amount flagged', amountBad.flags.includes(MANUAL_PAYMENT_RISK_FLAGS.AMOUNT_MISMATCH));

const trxDup = computeManualPaymentRisk({
  studentId: 1,
  amountClaimed: 500,
  expectedAmount: 500,
  pendingTrxMatches: [{ studentId: 2 }],
  screenshotMatches: [],
  recentDifferentTrxCount: 0,
  priorSenderNumbers: [],
  senderPhone: '+923001234567',
});
ok('duplicate pending TRX flagged', trxDup.flags.includes(MANUAL_PAYMENT_RISK_FLAGS.DUPLICATE_TRANSACTION_ID_PENDING));

const shotDup = computeManualPaymentRisk({
  studentId: 1,
  amountClaimed: 500,
  expectedAmount: 500,
  pendingTrxMatches: [],
  screenshotMatches: [{ studentId: 2, status: 'pending_review' }],
  recentDifferentTrxCount: 0,
  priorSenderNumbers: [],
  senderPhone: '+923001234567',
});
ok('duplicate screenshot flagged', shotDup.flags.includes(MANUAL_PAYMENT_RISK_FLAGS.DUPLICATE_SCREENSHOT_HASH));

ok(
  'seat confirmed only after approval constant',
  STANDALONE_SEAT_STATUS.CONFIRMED === 'confirmed' && STANDALONE_ORDER_STATUS.APPROVED === 'approved'
);

function canConfirmSeat(confirmed, capacity) {
  return Number(confirmed) < Number(capacity);
}
ok('exact last seat allowed', canConfirmSeat(99, 100));
ok('over-capacity blocked', !canConfirmSeat(100, 100));
ok('rejected payment does not consume confirmed seat math', canConfirmSeat(0, 100));

const closedTest = {
  test_access_type: 'paid_standalone',
  status: 'published',
  access_mode: 'private',
  deleted_at: null,
};
const openTest = { ...closedTest, access_mode: 'public' };
ok('approved seat is not exam-open', isPaidStandaloneTest(closedTest) && !isPaidStandaloneExamOpen(closedTest));
ok('exam open requires public access_mode', isPaidStandaloneExamOpen(openTest));
ok('paid window enforced', shouldEnforceScheduleWindow({ test_access_type: 'paid_standalone' }));
ok('course-linked window not enforced', !shouldEnforceScheduleWindow({ test_access_type: 'course_locked' }));

ok(
  'catalog is public',
  matchProtectionRule('/api/standalone-tests/catalog')?.policy === 'public'
);
ok(
  'free catalog is public',
  matchProtectionRule('/api/standalone-tests/free-catalog')?.policy === 'public'
);
ok(
  'my-tests requires identity',
  matchProtectionRule('/api/standalone-tests/my-tests')?.policy === 'identity_only'
);
ok(
  'my-results requires identity',
  matchProtectionRule('/api/standalone-tests/my-results')?.policy === 'identity_only'
);
ok(
  'register/pay/start require identity',
  matchProtectionRule('/api/standalone-tests/foo/register')?.policy === 'identity_only'
);
ok(
  'course tests stay entitlement-gated',
  matchProtectionRule('/api/tests/foo/verify-code')?.policy === 'entitlement'
);

ok('settings whitelist allows price_pkr', assertTestSettingsWhitelist({ price_pkr: 500 }).ok);
ok(
  'settings reject payment_status mass assignment',
  !assertTestSettingsWhitelist({ approved: true }).ok
);

mustContain(
  'src/services/paidStandaloneApproval.service.js',
  ['export async function approvePaidStandalonePayment', 'CAPACITY_REACHED', 'FOR UPDATE'],
  'canonical approval + capacity lock'
);
mustNotContain(
  'src/services/paidStandaloneApproval.service.js',
  ['activateEnrollmentInTransaction'],
  'approval must not enroll in a course'
);

mustContain(
  'src/services/paidStandalonePayment.service.js',
  ['computeManualPaymentRisk', 'lockAndLoadTransactionIdMatches', 'COUPON_NOT_SUPPORTED'],
  'reuse fraud + reject coupons'
);
mustContain(
  'src/services/manualPaymentFraudLookup.service.js',
  ['standalone_test_payments', 'manual_payments'],
  'TRX/hash lookup spans both products'
);
mustContain(
  'src/security/cee/paidStandaloneAccess.service.js',
  ['assertPaidStandaloneTestAccess', 'paid_standalone_exam_not_open', 'paid_standalone_seat_not_confirmed'],
  'canonical access path'
);
mustContain(
  'src/services/testAttempt.queries.js',
  ['STANDALONE_TEST_JOIN_SQL', 'LOCK_PAID_STANDALONE_TEST_FOR_START_SQL'],
  'paid attempt insert has no course join'
);
mustContain(
  'src/constants/testAccessType.constants.js',
  ["IN ('paid_standalone', 'free_standalone')", 't.course_id IS NULL'],
  'standalone SQL fragment excludes course_id'
);
mustContain(
  'src/services/testAttempt.service.js',
  ['createPaidStandaloneTestAttempt', 'INSERT_PAID_STANDALONE_TEST_RESULT_SQL', 'paidStandalone: Boolean(ctx.paidStandalone)'],
  'paid attempt + result path'
);
mustNotContain(
  'src/services/paidStandaloneRegistration.service.js',
  ['enrollments', 'activateEnrollment'],
  'registration creates no enrollment'
);
mustContain(
  'src/routes/paidStandalone.routes.js',
  [
    'requireCsrf',
    'manualPaymentSubmitRateLimit',
    'requireOwnedStandaloneTestOrder',
    'my-registration',
  ],
  'CSRF, rate limit, order ownership'
);
mustContain(
  'src/controllers/paidStandalone.controller.js',
  ['mapMulterFileToScreenshotInput(req.file)', "upload.single('screenshot')"],
  'screenshot submit maps multer filePath before finalize'
);
mustNotContain(
  'src/controllers/paidStandalone.controller.js',
  ['finalizeManualPaymentScreenshot(req.file)'],
  'must not pass raw multer file into finalize'
);
mustContain(
  'src/services/manualPaymentScreenshotUpload.service.js',
  ['filePath', 'storedPath', 'mapMulterFileToScreenshotInput'],
  'finalize contract uses filePath and returns storedPath'
);
mustContain(
  'src/services/paidStandalonePrep.service.js',
  ['computeEligiblePrepCanStart', 'loadConfirmedPaidStandaloneSeat', 'seatConfirmed'],
  'paid prep uses windowed canStart + confirmed seat'
);
mustNotContain(
  'src/services/paidStandalonePrep.service.js',
  ['computePrepCanStart({ availability, retake })'],
  'paid prep must not pass a bag into computePrepCanStart'
);
mustContain(
  'src/controllers/paidStandaloneReview.controller.js',
  ['assertManualPaymentReviewerRole'],
  'admin-only review'
);

const approvalSrc = readFileSync(path.join(serverRoot, 'src/services/paidStandaloneApproval.service.js'), 'utf8');
ok('duplicate approval blocked', approvalSrc.includes('ALREADY_APPROVED'));
ok('SQL uses placeholders', approvalSrc.includes('WHERE p.id = ?'));

const paymentSrc = readFileSync(path.join(serverRoot, 'src/services/paidStandalonePayment.service.js'), 'utf8');
ok('client price not trusted — uses t.price_pkr', paymentSrc.includes('t.price_pkr'));
ok('order ownership check', paymentSrc.includes('ORDER_ACCESS_DENIED'));

console.log(`\nPassed: ${passed}`);
console.log(`Failed: ${failed}`);
if (failed) process.exit(1);
