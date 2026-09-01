/**
 * Free standalone runtime wiring (source assertions, no live DB).
 * Run: npm run test:free-standalone
 */
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { matchProtectionRule } from '../security/cee/protectionGrid.js';
import { isFreeStandaloneExamOpen, isFreeStandaloneTest } from '../security/cee/freeStandaloneAccess.service.js';
import { shouldEnforceScheduleWindow } from '../security/cee/courseLinkedTestAccess.service.js';
import { isStandaloneAccessType } from '../validators/testAccessType.js';

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

console.log('free standalone runtime\n');

ok('free row is classified', isFreeStandaloneTest({ test_access_type: 'free_standalone' }));
ok(
  'exam open requires published + public',
  isFreeStandaloneExamOpen({
    test_access_type: 'free_standalone',
    status: 'published',
    access_mode: 'public',
    deleted_at: null,
  })
);
ok(
  'closed exam is not open',
  !isFreeStandaloneExamOpen({
    test_access_type: 'free_standalone',
    status: 'published',
    access_mode: 'private',
    deleted_at: null,
  })
);
ok('schedule window applies', shouldEnforceScheduleWindow({ test_access_type: 'free_standalone' }));
ok('pairing helper treats free as standalone', isStandaloneAccessType('free_standalone'));

ok(
  'my-tests is identity-only (not public, not entitlement)',
  matchProtectionRule('/api/standalone-tests/my-tests')?.policy === 'identity_only'
);
ok(
  'my-results is identity-only (not public, not entitlement)',
  matchProtectionRule('/api/standalone-tests/my-results')?.policy === 'identity_only'
);
ok(
  'free catalog is public',
  matchProtectionRule('/api/standalone-tests/free-catalog')?.policy === 'public'
);
ok(
  'free start is identity-only (not entitlement)',
  matchProtectionRule('/api/standalone-tests/foo/verify-code')?.policy === 'identity_only'
);
ok(
  'free-session guest start is public',
  matchProtectionRule('/api/standalone-tests/foo/free-session/start')?.policy === 'public'
);
ok(
  'course slug runtime stays entitlement-gated',
  matchProtectionRule('/api/tests/foo/verify-code')?.policy === 'entitlement'
);

mustNotContain(
  'src/services/test.service.js',
  ['assertFreeStandaloneNotEnabled'],
  'create/publish no longer blocks free standalone'
);
mustNotContain(
  'src/validators/testAccessType.js',
  ['assertFreeStandaloneNotEnabled', 'FREE_STANDALONE_NOT_ENABLED'],
  'validator no longer rejects free standalone'
);
mustContain(
  'src/security/cee/freeStandaloneAccess.service.js',
  ['assertFreeStandaloneTestAccess', 'free_standalone_seats_full', 'free_standalone_exam_not_open'],
  'canonical free access path'
);
mustContain(
  'src/services/freeStandaloneCatalog.service.js',
  ['computeEligiblePrepCanStart', 'STANDALONE_ACTIVE_CATALOG_WHERE_SQL', 'seatsFull'],
  'free catalog lists published non-expired tests including closed; prep uses windowed canStart'
);
mustNotContain(
  'src/services/freeStandaloneCatalog.service.js',
  ['computePrepCanStart({ availability, retake })'],
  'free prep must not pass a bag into computePrepCanStart'
);
mustContain(
  'src/routes/paidStandalone.routes.js',
  ['/free-catalog', '/my-results', '/my-tests', 'integrity-events'],
  'free catalog + my-results + integrity routes'
);
mustContain(
  'src/services/examIntegrity.store.js',
  ['test_integrity_blocks', 'EXAM_INTEGRITY_MAX_STRIKES'],
  'integrity blocks are per test+user'
);

const showcase = readFileSync(
  path.join(clientRoot, 'src/components/home/FreeTestsShowcase.jsx'),
  'utf8'
);
ok('homepage lists free catalog', showcase.includes('freeCatalog'));
ok('homepage does not list course studentApi tests', !showcase.includes('studentApi'));

console.log(`\nPassed: ${passed}`);
console.log(`Failed: ${failed}`);
if (failed) process.exit(1);
