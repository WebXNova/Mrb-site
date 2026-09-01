/**
 * Regression: free + paid standalone Start Test eligibility and attempt creation.
 * Run: npm run test:standalone-start
 */
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { matchProtectionRule } from '../security/cee/protectionGrid.js';
import {
  computeEligiblePrepCanStart,
  computePrepCanStart,
  evaluateRetakePolicy,
} from './testRetakePolicy.service.js';
import { TEST_ACCESS_REASON_MESSAGES } from '../errors/testAttempt/TestAttemptErrors.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.join(__dirname, '..', '..');
const clientRoot = path.join(serverRoot, '..', 'client');

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

function mustContain(root, fileRel, needles, label) {
  const filePath = path.join(root, fileRel);
  ok(`exists: ${fileRel}`, existsSync(filePath));
  const text = readFileSync(filePath, 'utf8');
  for (const needle of needles) {
    ok(`${label}: "${needle}"`, text.includes(needle));
  }
  return text;
}

function mustNotContain(root, fileRel, needles, label) {
  const filePath = path.join(root, fileRel);
  ok(`exists: ${fileRel}`, existsSync(filePath));
  const text = readFileSync(filePath, 'utf8');
  for (const needle of needles) {
    ok(`${label}: no "${needle}"`, !text.includes(needle));
  }
}

console.log('standalone start regression\n');

const retake = evaluateRetakePolicy({ max_attempts: 1 }, { totalAttempts: 0, hasActiveAttempt: false });
const resume = evaluateRetakePolicy({ max_attempts: 1 }, { totalAttempts: 1, hasActiveAttempt: true });
const openWindow = {
  canCreateAttempt: true,
  canResumeInProgress: true,
  notYetAvailable: false,
  noLongerAvailable: false,
};

ok(
  'FREE: registration-equivalent identity start allowed when exam open + window + retake',
  computeEligiblePrepCanStart({
    examOpen: true,
    availability: openWindow,
    retake,
    hasActiveAttempt: false,
  }) === true
);
ok(
  'PAID: approval/open mismatch — seat-confirmed UI still cannot start when exam closed',
  computeEligiblePrepCanStart({
    examOpen: false,
    availability: openWindow,
    retake,
    hasActiveAttempt: false,
  }) === false
);
ok(
  'availability: before start denied',
  computeEligiblePrepCanStart({
    examOpen: true,
    availability: { ...openWindow, canCreateAttempt: false, notYetAvailable: true },
    retake,
    hasActiveAttempt: false,
  }) === false
);
ok(
  'availability: after end denied',
  computeEligiblePrepCanStart({
    examOpen: true,
    availability: { ...openWindow, canCreateAttempt: false, noLongerAvailable: true },
    retake,
    hasActiveAttempt: false,
  }) === false
);
ok(
  'resume allowed during window',
  computeEligiblePrepCanStart({
    examOpen: true,
    availability: openWindow,
    retake: resume,
    hasActiveAttempt: true,
  }) === true
);
ok(
  'legacy bag is never a valid retake evaluation',
  computePrepCanStart({ availability: openWindow, retake }) !== true
);

ok(
  'seat not confirmed has a specific student message',
  TEST_ACCESS_REASON_MESSAGES.paid_standalone_seat_not_confirmed.includes('seat')
);
ok(
  'exam not open has a specific student message',
  TEST_ACCESS_REASON_MESSAGES.paid_standalone_exam_not_open.includes('not open')
);

ok(
  'standalone start is identity-only (not course entitlement)',
  matchProtectionRule('/api/standalone-tests/foo/verify-code')?.policy === 'identity_only'
);
ok(
  'course-linked start stays entitlement-gated',
  matchProtectionRule('/api/tests/foo/verify-code')?.policy === 'entitlement'
);
ok(
  'unauthenticated standalone start is not public',
  matchProtectionRule('/api/standalone-tests/foo/verify-code')?.policy !== 'public'
);

mustContain(
  serverRoot,
  'src/services/paidStandalonePrep.service.js',
  ['computeEligiblePrepCanStart', 'seatConfirmed', 'loadConfirmedPaidStandaloneSeat'],
  'paid prep ANDs confirmed seat with windowed canStart'
);
mustNotContain(
  serverRoot,
  'src/services/paidStandalonePrep.service.js',
  ['computePrepCanStart({ availability, retake })'],
  'paid prep must not pass a bag into computePrepCanStart'
);
mustContain(
  serverRoot,
  'src/services/freeStandaloneCatalog.service.js',
  ['computeEligiblePrepCanStart', 'seatsFull', 'integrityBlocked'],
  'free prep uses windowed canStart and exposes seat/integrity denials'
);
mustNotContain(
  serverRoot,
  'src/services/freeStandaloneCatalog.service.js',
  ['computePrepCanStart({ availability, retake })', 'activateEnrollment', 'assertCourseAccess'],
  'free prep must not use course enrollment or the retake bag'
);
mustContain(
  serverRoot,
  'src/security/cee/freeStandaloneAccess.service.js',
  ['phase !== AVAILABILITY_PHASE.IN_PROGRESS && !isFreeStandaloneExamOpen'],
  'in-progress resume does not require the exam to still be Open'
);
mustContain(
  serverRoot,
  'src/services/testAttempt.service.js',
  [
    'assertStandaloneStartAccess',
    'createPaidStandaloneTestAttempt',
    'persistAttemptExamSnapshot',
    'paidStandalone: Boolean(ctx.paidStandalone)',
  ],
  'attempt create uses canonical standalone access + snapshot; submit recovery is standalone-aware'
);
mustContain(
  serverRoot,
  'src/services/testAttempt.queries.js',
  ['INSERT_PAID_STANDALONE_TEST_ATTEMPT_SQL', 'STANDALONE_TEST_JOIN_SQL'],
  'attempt insert is course-join free'
);

const instructions = mustContain(
  clientRoot,
  'src/features/test-instructions/TestInstructionsPage.jsx',
  ['prep?.canStart === true'],
  'instructions Start is gated on backend prep.canStart'
);
ok(
  'instructions still require login for start',
  instructions.includes('isAuthenticated')
);

mustContain(
  clientRoot,
  'src/pages/PaidTestPage.jsx',
  ['registration?.canStart', 'accessKind: \'paid_standalone\'', 'startInFlightRef'],
  'paid Start uses backend canStart, stores accessKind, and is double-click safe'
);

mustContain(
  clientRoot,
  'src/api/standaloneTestsApi.js',
  ['raw.accessKind === \'free_standalone\'', 'raw.accessKind === \'paid_standalone\''],
  'runtime routing reads persisted accessKind, not only a session flag'
);

console.log(`\nPassed: ${passed}`);
console.log(`Failed: ${failed}`);
if (failed) process.exit(1);
