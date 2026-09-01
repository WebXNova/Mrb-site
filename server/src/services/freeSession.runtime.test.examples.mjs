/**
 * Free Session flow — source + unit assertions (no live DB).
 * Run: npm run test:free-session
 */
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { matchProtectionRule } from '../security/cee/protectionGrid.js';
import { sanitizeGuestDisplayName } from '../validators/freeSessionName.js';
import { FREE_SESSION_IDENTITY } from '../constants/freeSession.constants.js';

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

function mustContain(fileRel, needles, label, root = serverRoot) {
  const filePath = path.join(root, fileRel);
  ok(`exists: ${fileRel}`, existsSync(filePath));
  const text = readFileSync(filePath, 'utf8');
  for (const needle of needles) {
    ok(`${label}: "${needle}"`, text.includes(needle));
  }
}

function mustNotContain(fileRel, needles, label, root = serverRoot) {
  const filePath = path.join(root, fileRel);
  ok(`exists: ${fileRel}`, existsSync(filePath));
  const text = readFileSync(filePath, 'utf8');
  for (const needle of needles) {
    ok(`${label}: no "${needle}"`, !text.includes(needle));
  }
}

function expectThrow(label, fn) {
  try {
    fn();
    failed += 1;
    console.error(`  ✗ ${label}`);
  } catch {
    passed += 1;
    console.log(`  ✓ ${label}`);
  }
}

console.log('free session flow\n');

ok('identity states exist', Boolean(FREE_SESSION_IDENTITY.ENROLLMENT_PENDING && FREE_SESSION_IDENTITY.CLAIMED));
ok(
  'guest cookie hashes to 64 hex',
  /^[a-f0-9]{64}$/.test(crypto.createHash('sha256').update('abc').digest('hex'))
);

ok('valid name accepted', sanitizeGuestDisplayName('  Ali Raza  ') === 'Ali Raza');
ok('unicode name accepted', sanitizeGuestDisplayName('محمد علی') === 'محمد علی');
expectThrow('empty name rejected', () => sanitizeGuestDisplayName('   '));
expectThrow('xss name rejected', () => sanitizeGuestDisplayName('<script>alert(1)</script>'));
expectThrow('url name rejected', () => sanitizeGuestDisplayName('http://evil.test'));
expectThrow('digits-only name rejected', () => sanitizeGuestDisplayName('12345'));
expectThrow('oversized name rejected', () => sanitizeGuestDisplayName('A'.repeat(81)));

ok(
  'free-session start is public',
  matchProtectionRule('/api/standalone-tests/foo/free-session/start')?.policy === 'public'
);
ok(
  'free-session status is public',
  matchProtectionRule('/api/standalone-tests/foo/free-session')?.policy === 'public'
);
ok(
  'free-session enrollment is public',
  matchProtectionRule('/api/standalone-tests/foo/free-session/enrollment')?.policy === 'public'
);
ok(
  'free-session claim is identity_only',
  matchProtectionRule('/api/standalone-tests/foo/free-session/claim')?.policy === 'identity_only'
);
ok(
  'free-session integrity events are public',
  matchProtectionRule('/api/standalone-tests/foo/free-session/attempts/9/integrity-events')?.policy === 'public'
);
ok(
  'paid verify-code stays identity_only',
  matchProtectionRule('/api/standalone-tests/foo/verify-code')?.policy === 'identity_only'
);
ok(
  'course tests stay entitlement',
  matchProtectionRule('/api/tests/foo/verify-code')?.policy === 'entitlement'
);

mustContain(
  'src/services/freeSession.service.js',
  [
    'startFreeSessionAttempt',
    'saveFreeSessionEnrollment',
    'claimFreeSessionAttempt',
    'persistAttemptExamSnapshot',
    'pending_result_json',
    'guest_session_hash',
    'FREE_SESSION_ALREADY_OWNED',
  ],
  'canonical free session service'
);
mustNotContain(
  'src/services/freeSession.service.js',
  ['enrollmentLifecycle', 'entitlement.service', 'safepay', 'createPaidStandaloneTestAttempt'],
  'free session must not call payment/enrollment lifecycle'
);
mustContain(
  'src/controllers/freeSession.controller.js',
  ['req.body?.studentName', 'parseStudentId(req)', 'readFreeSessionHash', 'postFreeSessionIntegrityEvent'],
  'claim uses session cookie + authenticated student, not body ids'
);
mustNotContain(
  'src/controllers/freeSession.controller.js',
  ['req.body.attemptId', 'req.body.userId', 'req.body.studentId'],
  'controller must not trust client attempt/user ids'
);
mustContain(
  'src/db/ensureTestsApplicationSchema.js',
  ['guest_session_hash', 'identity_status', 'enrollment_profile_json', 'student_id is nullable'],
  'schema bootstrap for guests'
);
mustContain(
  'src/services/test.service.js',
  ['/free-test/${publicSlug}'],
  'admin public link for free standalone'
);
mustContain(
  'src/routes/paidStandalone.routes.js',
  ['/free-session/start', '/free-session/claim', '/free-session/enrollment', 'integrity-events'],
  'free session routes'
);

mustContain(
  'src/features/free-session/FreeTestLandingPage.jsx',
  ['Enter your name', 'Start test', 'freeSessionStart'],
  'name-only landing',
  clientRoot
);
mustNotContain(
  'src/features/free-session/FreeTestLandingPage.jsx',
  ['Go to sign in', 'Create account', 'Continue to Payment'],
  'landing must not require login or payment',
  clientRoot
);
mustContain(
  'src/features/free-session/FreeTestEnrollPage.jsx',
  ['EnrollmentForm', 'Continue to sign in', 'Complete your information'],
  'post-submit enrollment form',
  clientRoot
);
mustContain(
  'src/routes/AppRouter.jsx',
  ['/free-test/:slug', '/free-test/:slug/start', '/free-test/:slug/enroll', '/free-test/:slug/claim'],
  'free session routes',
  clientRoot
);
mustContain(
  'src/components/home/FreeTestsShowcase.jsx',
  ['/free-test/'],
  'hub cards use free-test links',
  clientRoot
);
mustContain(
  'src/features/free-session/FreeTestClaimPage.jsx',
  ['Login / Sign up', 'Create account', 'Sign in'],
  'post-enrollment login or signup',
  clientRoot
);
mustContain(
  'src/pages/StudentLoginPage.jsx',
  ['withSafeFromQuery', 'isFreeSessionReturnPath'],
  'login preserves free-session return path',
  clientRoot
);
mustContain(
  'src/admin/pages/AdminTestsPage.jsx',
  ['Test link copied'],
  'admin copy success copy',
  clientRoot
);

console.log(`\nPassed: ${passed}`);
console.log(`Failed: ${failed}`);
if (failed) process.exit(1);
