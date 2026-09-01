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
  'admin routes still guard unpublished-only ops'
);

mustContain(
  'src/routes/testQuizDraft.routes.js',
  ['putTestQuizDraftHandler'],
  'quiz draft PUT remains available'
);

mustContain(
  'src/services/publishedTestEdit.service.js',
  ['resolvePublishedEditContext', 'auditPublishedTestEdit'],
  'published edit authority'
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

ok('published status still flags unpublished-only ops', isTestReadOnlyStatus('published') === true);
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
  ok('admin DTO does not mark published tests read-only', testService.includes('isReadOnly: false'));
  ok('wizard writes allow published edit', testService.includes('allowPublishedEdit: publishContext.isPublished'));
}

{
  const quizView = readFileSync(
    path.join(serverRoot, '../client/src/features/quiz-builder/components/QuizBuilderView.jsx'),
    'utf8'
  );
  ok('quiz builder uses useTestReadOnly', quizView.includes('useTestReadOnly'));
  ok('quiz builder stays editable for published tests', quizView.includes('const readOnly = false'));
  ok('quiz builder enables published edit hydration', quizView.includes('editingPublished'));
  ok('quiz builder uses read-only action guard', quizView.includes('useReadOnlyQuizActions'));
  ok('quiz builder shows published edit banner', quizView.includes('PublishedTestEditBanner'));
}

{
  const workspace = readFileSync(
    path.join(serverRoot, '../client/src/admin/components/test-workspace/TestWorkspaceLayout.jsx'),
    'utf8'
  );
  ok('workspace does not lock published tests', workspace.includes('readOnly: false'));
  ok('workspace shows published edit banner', workspace.includes('PublishedTestEditBanner'));
}

{
  const settingsForm = readFileSync(
    path.join(serverRoot, '../client/src/admin/components/test-settings/TestSettingsForm.jsx'),
    'utf8'
  );
  ok('settings form sends published edit controls', settingsForm.includes('withPublishedEditControls'));
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
