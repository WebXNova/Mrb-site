/**
 * Test Creation security — acceptance tests (static wiring).
 *
 * Run: npm run test:test-creation-security
 */
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { applyQuestionWriteSecurity } from '../security/questionContentSecurity.js';
import { assertTestUnpublished } from './publishedTestLock.service.js';

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
  ok(`file exists: ${fileRel}`, existsSync(filePath));
  const text = readFileSync(filePath, 'utf8');
  for (const needle of needles) {
    ok(`${label}: "${needle}"`, text.includes(needle));
  }
}

function mustNotContain(fileRel, needles, label) {
  const filePath = path.join(serverRoot, fileRel);
  const text = readFileSync(filePath, 'utf8');
  for (const needle of needles) {
    ok(`${label} absent: "${needle}"`, !text.includes(needle));
  }
}

console.log('testCreationSecurity — acceptance tests\n');

mustNotContain(
  'src/routes/admin.routes.js',
  ['postLinkTestQuestion', 'testQuestionBulkRateLimit', 'deleteBulkUnlinkTestQuestions'],
  'legacy link routes removed'
);

mustContain(
  'src/routes/admin.routes.js',
  ['requireUnpublishedTest', 'patchTestBasicInfo', 'patchTestRules', 'patchTestSettings'],
  'wizard mutations guarded'
);

mustContain(
  'src/routes/testQuizDraft.routes.js',
  ['requireUnpublishedTest', 'putTestQuizDraftHandler'],
  'quiz draft mutations guarded'
);

mustNotContain('src/services/test.service.js', ['allowPublishedMaintenance'], 'published bypass removed');

mustContain(
  'src/services/test.service.js',
  ['assertTestMutationAccess', 'isReadOnly', 'enforceUnpublishedTest'],
  'test service security'
);

mustContain(
  'src/services/questions.service.js',
  ['enforceQuestionBankMutationAllowed', 'assertQuestionMutationAccess'],
  'question bank service guarded'
);

mustContain(
  'src/security/questionContentSecurity.js',
  ['sanitizeQuestionHtml(option.option_text)'],
  'option text sanitized'
);

mustContain(
  'src/services/publishedTestLock.service.js',
  ['READY_FOR_PUBLISH'],
  'publish-ready question lock'
);

mustContain(
  'src/security/admin/adminSecurityStack.js',
  ['adminCsrfProtection', 'requireAdmin'],
  'admin CSRF + auth stack'
);

mustContain(
  'src/validators/testBasicInfo.schema.js',
  ['.strict()'],
  'mass assignment guard basic info'
);

mustContain(
  'src/validators/testQuizDraft.schema.js',
  ['.strict()'],
  'mass assignment guard quiz draft'
);

mustContain(
  'src/controllers/tests.controller.js',
  ['rejectLifecycleFieldsInBody'],
  'lifecycle field injection blocked'
);

mustContain(
  'src/routes/admin.routes.js',
  ['adminSecurityStack', 'getTestResultsExport'],
  'admin routes use security stack'
);

mustContain(
  'src/routes/admin.routes.js',
  ['testWriteRateLimit', 'getTestResultsExport'],
  'results export rate limited'
);

mustContain(
  'src/services/testMutationAccess.service.js',
  ['TEST_COURSE_REASSIGNMENT_DENIED'],
  'test course reassignment guarded'
);

mustContain(
  'src/controllers/questionBankImageUpload.controller.js',
  ['finalizeQuestionBankImageUpload', 'LIMIT_FILE_SIZE'],
  'image upload hardened'
);

{
  const secured = applyQuestionWriteSecurity({
    question_text: '<p>Stem</p>',
    explanation: null,
    options: [
      { option_text: '<strong>Safe</strong><script>alert(1)</script>', is_correct: true },
      { option_text: 'B', is_correct: false },
    ],
  });
  ok('stored XSS stripped from option_text', !secured.options[0].option_text.includes('<script>'));
}

{
  let blocked = false;
  try {
    assertTestUnpublished({ id: 3, status: 'published' });
  } catch (error) {
    blocked = error.errorCode === 'TEST_IS_LOCKED';
  }
  ok('published tests blocked at service layer', blocked);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
