/**
 * Legacy question-bank linking cleanup verification.
 * Run: node scripts/verify-legacy-link-cleanup.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.join(__dirname, '..');
const clientRoot = path.join(serverRoot, '..', 'client');

function read(rel) {
  return fs.readFileSync(path.join(serverRoot, rel), 'utf8');
}

function readClient(rel) {
  return fs.readFileSync(path.join(clientRoot, rel), 'utf8');
}

function assertMissing(label, rel) {
  const filePath = path.join(serverRoot, rel);
  if (fs.existsSync(filePath)) {
    throw new Error(`${label}: file still exists at ${rel}`);
  }
  console.log(`PASS ${label}`);
}

function assertMatch(label, content, pattern) {
  if (!pattern.test(content)) throw new Error(`${label}: missing ${pattern}`);
  console.log(`PASS ${label}`);
}

function assertNoMatch(label, content, pattern) {
  if (pattern.test(content)) throw new Error(`${label}: found ${pattern}`);
  console.log(`PASS ${label}`);
}

assertMissing('legacy link service removed', 'src/services/testQuestionLink.service.js');
assertMissing('legacy link schema removed', 'src/validators/testQuestionLink.schema.js');
assertMissing('bulk rate limit removed', 'src/middleware/testQuestionBulkRateLimit.js');

const adminRoutes = read('src/routes/admin.routes.js');
assertNoMatch('admin routes — no POST link', adminRoutes, /postLinkTestQuestion/);
assertNoMatch('admin routes — no DELETE bulk unlink', adminRoutes, /deleteBulkUnlinkTestQuestions/);
assertNoMatch('admin routes — no available picker', adminRoutes, /questions\/available/);
assertMatch('admin routes — read-only GET questions', adminRoutes, /getLinkedTestQuestions/);

const composition = read('src/services/testQuestionComposition.service.js');
assertMatch('composition — admin list helper', composition, /listComposedTestQuestionsAdmin/);
assertMatch('composition — load composed', composition, /loadComposedTestQuestions/);

const materialization = read('src/services/testQuizDraftMaterialization.service.js');
assertMatch('materialization — uses shared limits', materialization, /testQuestionLimits\.schema/);

const mutationAuthority = read('src/constants/testMutationAuthority.constants.js');
assertMatch('mutation authority — legacy routes disabled', mutationAuthority, /postLinkTestQuestion/);
assertMatch('mutation authority — quiz draft mutations', mutationAuthority, /AUTHORIZED_QUIZ_DRAFT_MUTATIONS/);

const detailsPage = readClient('src/admin/pages/AdminTestDetailsPage.jsx');
assertNoMatch('details page — no legacy link API', detailsPage, /adminApi\.testQuestions/);
assertMatch('details page — uses completeness count', detailsPage, /question_count/);

console.log('Legacy question-bank linking cleanup verification complete.');
