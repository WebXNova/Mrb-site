/**
 * Teacher Question Threads — security acceptance tests.
 *
 * Run: npm run test:teacher-question-threads-security
 */
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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

console.log('teacherQuestionThreadsSecurity — acceptance tests\n');

mustContain(
  'src/services/teacherQuestionThreads.service.js',
  [
    'assigned_teacher_id = ?',
    'assertTeacherIsOperational',
    'threadId',
    'GROUP BY sq.user_id',
    'ORDER BY sq.created_at ASC',
  ],
  'thread service ownership + grouping'
);

mustNotContain(
  'src/services/teacherQuestionThreadRef.js',
  ['SESSION_SECRET', 'mrb-teacher-thread-dev-only'],
  'no insecure fallbacks in threadRef'
);

mustContain(
  'src/services/teacherQuestionThreadRef.js',
  ['getTeacherThreadSecrets', 'buildTeacherQuestionThreadIdWithSecret'],
  'uses validated secrets'
);

mustContain(
  'src/services/teacherQuestionThreads.service.js',
  ['MARK_TEACHER_THREAD_UNSEEN_SEEN_SQL', 'COUNT(DISTINCT sq.user_id)'],
  'set-based seen + optimized count'
);

mustNotContain(
  'src/services/teacherQuestionThreads.service.js',
  ['for (const row of rows)', 'WHERE id = ? AND assigned_teacher_id = ? AND status = \'pending\' AND seen_at IS NULL'],
  'no per-row seen updates'
);

mustContain(
  'src/controllers/teacherQuestions.controller.js',
  ['getTeacherQuestionThreads', 'getTeacherQuestionThreadById', 'getTeacherQuestionThreadId'],
  'thread controller'
);

mustContain(
  'src/routes/teacher.routes.js',
  ["'/question-threads'", "'/question-threads/:threadId'", "'/questions/:questionId/thread-id'"],
  'thread routes'
);

mustNotContain(
  'src/services/teacherQuestionThreads.service.js',
  ['userId:', 'studentUserId:'],
  'thread DTO privacy'
);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
