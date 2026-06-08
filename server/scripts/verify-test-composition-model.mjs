/**
 * P2 PATCH-6 — single composition model verification (test_subjects + question_bank).
 * Run: node scripts/verify-test-composition-model.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.join(__dirname, '..');
const repoRoot = path.join(serverRoot, '..');

function read(rel) {
  return fs.readFileSync(path.join(serverRoot, rel), 'utf8');
}

function readClient(rel) {
  return fs.readFileSync(path.join(repoRoot, rel), 'utf8');
}

function assertNoMatch(label, content, pattern) {
  if (pattern.test(content)) throw new Error(`${label}: forbidden ${pattern}`);
  console.log(`PASS ${label}`);
}

function assertMatch(label, content, pattern) {
  if (!pattern.test(content)) throw new Error(`${label}: missing ${pattern}`);
  console.log(`PASS ${label}`);
}

const services = [
  'src/services/testQuestionComposition.service.js',
  'src/services/testAttempt.service.js',
  'src/services/testAttempt/secureAttemptContext.js',
  'src/services/studentPortal.service.js',
  'src/services/test.service.js',
];

for (const rel of services) {
  const content = read(rel);
  assertNoMatch(`${rel} — no t.subject`, content, /\bt\.subject\b/);
  assertNoMatch(`${rel} — no tests.subject SELECT`, content, /tests\.subject/);
}

const composition = read('src/services/testQuestionComposition.service.js');
assertMatch('composition — qb.question_text join', composition, /qb\.question_text/);
assertMatch('composition — deleted_at filter', composition, /qb\.deleted_at IS NULL/);
assertNoMatch('composition — no options_json', composition, /options_json/);

const schema = read('src/sql/schema.sql');
assertNoMatch('schema test_questions — no question_text column', schema, /CREATE TABLE IF NOT EXISTS test_questions[\s\S]*?question_text/s);
assertMatch('schema — test_subjects table', schema, /CREATE TABLE IF NOT EXISTS test_subjects/);

const presentation = read('src/services/testSubjectPresentation.service.js');
assertMatch('presentation service', presentation, /test_subjects/);

const testService = read('src/services/test.service.js');
assertMatch('test.service — subjectIds in DTO', testService, /subjectIds/);
assertNoMatch('test.service — legacy row.subject in toTest', testService, /row\.subject[^_]/);

const adminCreate = readClient('client/src/admin/pages/AdminTestCreatePage.jsx');
assertNoMatch('AdminTestCreate — no free-text subject field', adminCreate, /name=["']subject["']/);
assertMatch('AdminTestCreate — subject_id', adminCreate, /subject_id/);

const publicTest = readClient('client/src/pages/PublicTestPage.jsx');
assertMatch('PublicTestPage — meta.subject display', publicTest, /meta\.subject/);

console.log('Test composition model verification complete.');
