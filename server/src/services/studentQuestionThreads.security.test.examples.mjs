/**
 * Student Question Threads — security acceptance tests.
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

console.log('studentQuestionThreadsSecurity — acceptance tests\n');

mustContain(
  'src/services/studentQuestionThreads.service.js',
  [
    'sq.user_id = ?',
    'getStudentQuestionFormContext',
    'GROUP BY sq.subject_id',
    'ORDER BY sq.created_at ASC',
    'threadId',
  ],
  'student thread service'
);

mustContain(
  'src/controllers/studentQuestions.controller.js',
  ['getStudentQuestionThreads', 'getStudentQuestionThreadById', 'getStudentQuestionThreadId'],
  'student thread controller'
);

mustContain(
  'src/routes/student.routes.js',
  ["'/question-threads'", "'/question-threads/:threadId'", "'/questions/:id/thread-id'"],
  'student thread routes'
);

mustNotContain(
  'src/services/studentQuestionThreads.service.js',
  ['userId:', 'assignedTeacherId:'],
  'student thread DTO privacy'
);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
