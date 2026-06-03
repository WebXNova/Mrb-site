/**
 * CSRF attach policy — Question Bank + existing admin/enrollment coverage.
 */
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { shouldAttachCsrf } from '../src/api/csrfAttachPolicy.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientRoot = path.join(__dirname, '..');

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
  assert(shouldAttachCsrf('/questions', 'POST'), 'POST /questions attaches CSRF');
  assert(shouldAttachCsrf('/questions/42', 'PUT'), 'PUT /questions/:id attaches CSRF');
  assert(shouldAttachCsrf('/questions/42', 'DELETE'), 'DELETE /questions/:id attaches CSRF');
  assert(shouldAttachCsrf('/questions/42', 'PATCH'), 'PATCH /questions/:id attaches CSRF');
  assert(shouldAttachCsrf('/questions?page=1', 'POST'), 'POST /questions?query attaches CSRF');
}

function testQuestionBankReadsUnaffected() {
  assert(!shouldAttachCsrf('/questions', 'GET'), 'GET /questions does not attach CSRF');
  assert(!shouldAttachCsrf('/questions/42', 'GET'), 'GET /questions/:id does not attach CSRF');
  assert(!shouldAttachCsrf('/questions?page=1&limit=20', 'GET'), 'GET /questions?query does not attach CSRF');
}

function testExistingAdminAndEnrollmentCoverage() {
  assert(shouldAttachCsrf('/admin/courses', 'POST'), 'POST /admin/* still attaches CSRF');
  assert(shouldAttachCsrf('/admin/users/1', 'DELETE'), 'DELETE /admin/* still attaches CSRF');
  assert(!shouldAttachCsrf('/admin/courses', 'GET'), 'GET /admin/* still excluded');
  assert(shouldAttachCsrf('/enrollments/admin/1/approve', 'POST'), 'POST /enrollments/admin/* still attaches CSRF');
  assert(!shouldAttachCsrf('/enrollments/admin/1', 'GET'), 'GET /enrollments/admin/* still excluded');
}

function testAuthRefreshPaths() {
  assert(shouldAttachCsrf('/auth/refresh', 'POST'), 'refresh always attaches CSRF');
  assert(shouldAttachCsrf('/auth/logout', 'POST'), 'logout always attaches CSRF');
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
  testRequestClientWiring();
  console.log('verify-request-client-csrf: OK');
} catch (e) {
  console.error(e.message || e);
  process.exit(1);
}
