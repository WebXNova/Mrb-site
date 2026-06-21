/**
 * Published test lock — acceptance tests.
 *
 * Run: npm run test:published-test-lock
 */
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  assertTestUnpublished,
  isTestReadOnlyStatus,
} from './publishedTestLock.service.js';

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

console.log('publishedTestLock — acceptance tests\n');

mustContain(
  'src/services/publishedTestLock.service.js',
  ['enforceUnpublishedTest', 'enforceQuestionBankMutationAllowed', 'assertTestUnpublished'],
  'lock service'
);

mustContain(
  'src/services/testValidation.service.js',
  ['enforceUnpublishedTest', 'assertTestUnpublished'],
  'validation delegates to lock service'
);

mustContain(
  'src/middleware/requireUnpublishedTest.js',
  ['enforceUnpublishedTest'],
  'API middleware'
);

mustContain(
  'src/routes/admin.routes.js',
  ['requireUnpublishedTest', 'patchTestBasicInfo', 'patchTestRules', 'patchTestSettings'],
  'admin routes guarded'
);

mustContain(
  'src/routes/testQuizDraft.routes.js',
  ['requireUnpublishedTest', 'putTestQuizDraftHandler'],
  'quiz draft mutations guarded'
);

mustContain(
  'src/services/questions.service.js',
  ['enforceQuestionBankMutationAllowed'],
  'question bank service guarded'
);

mustContain(
  'src/routes/questions.routes.js',
  ['requireQuestionBankWritable', 'putQuestion', 'deleteQuestion'],
  'question bank API guarded'
);

mustContain(
  'src/routes/admin.routes.js',
  ['router.put(\'/tests/:testId\', requireUnpublishedTest, putTest)'],
  'legacy putTest guarded'
);

ok('published status is read-only', isTestReadOnlyStatus('published') === true);
ok('draft status is editable', isTestReadOnlyStatus('DRAFT') === false);

{
  let blocked = false;
  try {
    assertTestUnpublished({ id: 9, status: 'published' });
  } catch (error) {
    blocked = error.errorCode === 'TEST_IS_LOCKED';
  }
  ok('assertTestUnpublished blocks published test', blocked);
}

{
  let allowed = true;
  try {
    assertTestUnpublished({ id: 9, status: 'DRAFT' });
  } catch {
    allowed = false;
  }
  ok('assertTestUnpublished allows draft test', allowed);
}

{
  const testService = readFileSync(path.join(serverRoot, 'src/services/test.service.js'), 'utf8');
  ok('settings update no longer bypasses lock', !testService.includes('allowPublishedMaintenance'));
  ok('test DTO exposes isReadOnly', testService.includes('isReadOnly'));
}

{
  const quizView = readFileSync(
    path.join(serverRoot, '../client/src/features/quiz-builder/components/QuizBuilderView.jsx'),
    'utf8'
  );
  ok('quiz builder uses useTestReadOnly', quizView.includes('useTestReadOnly'));
  ok('quiz builder disables question list when read-only', quizView.includes('disabled={readOnly}'));
  ok('quiz builder uses read-only action guard', quizView.includes('useReadOnlyQuizActions'));
  ok('quiz builder shows published banner', quizView.includes('PublishedTestReadOnlyBanner'));
}

{
  const rulesPage = readFileSync(
    path.join(serverRoot, '../client/src/admin/pages/AdminTestRulesPage.jsx'),
    'utf8'
  );
  ok('wizard rules page uses read-only hook', rulesPage.includes('useTestReadOnly'));
  ok('wizard rules form respects readOnly', rulesPage.includes('readOnly={readOnly}'));
}

{
  const settingsPage = readFileSync(
    path.join(serverRoot, '../client/src/admin/pages/AdminTestSettingsPage.jsx'),
    'utf8'
  );
  ok('wizard settings page uses read-only hook', settingsPage.includes('useTestReadOnly'));
  ok('wizard settings form respects readOnly', settingsPage.includes('readOnly={readOnly}'));
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
