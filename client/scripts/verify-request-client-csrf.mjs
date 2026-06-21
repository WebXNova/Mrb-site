/**
 * CSRF attach policy — Question Bank + existing admin/enrollment coverage.
 */
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { shouldAttachCsrf } from '../src/api/csrfAttachPolicy.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientRoot = path.join(__dirname, '..');

const TEST_ADMIN_SEGMENT = 'test-secret-segment16';
globalThis.window = { __MRB_ADMIN_SHELL__: Object.freeze({ s: TEST_ADMIN_SEGMENT }) };
const secretPrefix = `/admin/${TEST_ADMIN_SEGMENT}`;

function assert(condition, message) {
  if (!condition) throw new Error(`[verify-request-client-csrf] ${message}`);
}

function mustContain(fileRel, needles, label) {
  const p = path.join(clientRoot, fileRel);
  if (!existsSync(p)) throw new Error(`[verify-request-client-csrf] missing file: ${fileRel}`);
  const text = readFileSync(p, 'utf8');
  for (const n of needles) {
    if (!text.includes(n)) {
      throw new Error(`[verify-request-client-csrf] ${label}: expected "${n}" in ${fileRel}`);
    }
  }
}

function testQuestionBankMutations() {
  assert(shouldAttachCsrf(`${secretPrefix}/questions`, 'POST'), 'POST secret /questions attaches CSRF');
  assert(shouldAttachCsrf(`${secretPrefix}/questions/42`, 'PUT'), 'PUT secret /questions/:id attaches CSRF');
  assert(shouldAttachCsrf(`${secretPrefix}/questions/42`, 'DELETE'), 'DELETE secret /questions/:id attaches CSRF');
  assert(shouldAttachCsrf(`${secretPrefix}/questions/42`, 'PATCH'), 'PATCH secret /questions/:id attaches CSRF');
  assert(shouldAttachCsrf(`${secretPrefix}/questions?page=1`, 'POST'), 'POST secret /questions?query attaches CSRF');
}

function testQuestionBankReadsUnaffected() {
  assert(!shouldAttachCsrf(`${secretPrefix}/questions`, 'GET'), 'GET secret /questions does not attach CSRF');
  assert(!shouldAttachCsrf(`${secretPrefix}/questions/42`, 'GET'), 'GET secret /questions/:id does not attach CSRF');
  assert(
    !shouldAttachCsrf(`${secretPrefix}/questions?page=1&limit=20`, 'GET'),
    'GET secret /questions?query does not attach CSRF'
  );
}

function testExistingAdminAndEnrollmentCoverage() {
  assert(shouldAttachCsrf(`${secretPrefix}/courses`, 'POST'), 'POST secret admin mount attaches CSRF');
  assert(shouldAttachCsrf(`${secretPrefix}/users/1`, 'DELETE'), 'DELETE secret admin mount attaches CSRF');
  assert(!shouldAttachCsrf(`${secretPrefix}/courses`, 'GET'), 'GET secret admin mount still excluded');
  assert(
    shouldAttachCsrf(`${secretPrefix}/enrollments/1/approve`, 'POST'),
    'POST secret enrollments admin attaches CSRF'
  );
  assert(!shouldAttachCsrf(`${secretPrefix}/enrollments/1`, 'GET'), 'GET secret enrollments admin still excluded');
}

function testAuthRefreshPaths() {
  assert(shouldAttachCsrf('/auth/refresh', 'POST'), 'refresh always attaches CSRF');
  assert(shouldAttachCsrf('/auth/logout', 'POST'), 'logout always attaches CSRF');
}

function testStudentTestWriteMutations() {
  assert(shouldAttachCsrf('/student/tests/29/start', 'POST'), 'POST /student/tests/:testId/start attaches CSRF');
  assert(
    shouldAttachCsrf('/student/attempts/1001/answer', 'POST'),
    'POST /student/attempts/:attemptId/answer attaches CSRF'
  );
  assert(!shouldAttachCsrf('/student/tests/29/start', 'GET'), 'GET /student/tests/:testId/start does not attach CSRF');
  assert(!shouldAttachCsrf('/student/attempts/1001', 'GET'), 'GET /student/attempts/:attemptId does not attach CSRF');
}

function testSlugTestWriteMutations() {
  assert(
    shouldAttachCsrf('/tests/my-slug/attempts/1001/answers', 'PATCH'),
    'PATCH /tests/:slug/attempts/:attemptId/answers attaches CSRF'
  );
  assert(
    shouldAttachCsrf('/tests/my-slug/attempts/1001/submit', 'POST'),
    'POST /tests/:slug/attempts/:attemptId/submit attaches CSRF'
  );
  assert(
    !shouldAttachCsrf('/tests/my-slug/attempts/1001/start', 'GET'),
    'GET /tests/:slug/attempts/:attemptId/start does not attach CSRF'
  );
  assert(!shouldAttachCsrf('/tests/my-slug/verify-code', 'POST'), 'POST verify-code still excluded');
}

function testPaymentCheckoutMutation() {
  assert(shouldAttachCsrf('/payments/create-session', 'POST'), 'POST /payments/create-session attaches CSRF');
  assert(!shouldAttachCsrf('/payments/create-session', 'GET'), 'GET /payments/create-session does not attach CSRF');
}

function testTeacherThreadMessageMutation() {
  assert(
    shouldAttachCsrf('/teacher/question-threads/thread-abc-123/messages', 'POST'),
    'POST /teacher/question-threads/:threadId/messages attaches CSRF'
  );
  assert(
    !shouldAttachCsrf('/teacher/question-threads/thread-abc-123/messages', 'GET'),
    'GET /teacher/question-threads/:threadId/messages does not attach CSRF'
  );
  assert(
    !shouldAttachCsrf('/teacher/question-threads/thread-abc-123', 'GET'),
    'GET /teacher/question-threads/:threadId does not attach CSRF'
  );
}

function testQuizDraftMutations() {
  assert(shouldAttachCsrf(`${secretPrefix}/tests/29/quiz-draft`, 'PUT'), 'PUT secret quiz-draft attaches CSRF');
  assert(shouldAttachCsrf(`${secretPrefix}/tests/29/quiz-draft`, 'DELETE'), 'DELETE secret quiz-draft attaches CSRF');
  assert(shouldAttachCsrf(`${secretPrefix}/tests/29/quiz-draft`, 'PATCH'), 'PATCH secret quiz-draft attaches CSRF');
  assert(shouldAttachCsrf(`${secretPrefix}/tests/29/quiz-draft`, 'POST'), 'POST secret quiz-draft attaches CSRF');
  assert(!shouldAttachCsrf(`${secretPrefix}/tests/29/quiz-draft`, 'GET'), 'GET secret quiz-draft does not attach CSRF');
  assert(!shouldAttachCsrf('/tests/my-slug/verify-code', 'POST'), 'student slug routes unchanged');
}

function testRequestClientWiring() {
  mustContain(
    'src/api/requestClient.js',
    ["import { REFRESH_PATH, shouldAttachCsrf } from './csrfAttachPolicy.js'", 'shouldAttachCsrf(path, method)'],
    'requestClient imports shared CSRF policy'
  );
  mustContain(
    'src/api/requestClient.js',
    ["const csrfToken = shouldAttachCsrf(path, method) ? readCookie(CSRF_COOKIE_NAME) : ''"],
    'request attaches header from policy'
  );
}

try {
  testQuestionBankMutations();
  testQuestionBankReadsUnaffected();
  testExistingAdminAndEnrollmentCoverage();
  testAuthRefreshPaths();
  testStudentTestWriteMutations();
  testSlugTestWriteMutations();
  testPaymentCheckoutMutation();
  testTeacherThreadMessageMutation();
  testQuizDraftMutations();
  testRequestClientWiring();
  console.log('verify-request-client-csrf: OK');
} catch (e) {
  console.error(e.message || e);
  process.exit(1);
}
