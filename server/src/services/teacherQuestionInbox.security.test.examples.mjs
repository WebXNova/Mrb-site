/**
 * Teacher Question Inbox — security acceptance tests.
 *
 * Run: npm run test:teacher-question-inbox-security
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

console.log('teacherQuestionInboxSecurity — acceptance tests\n');

mustContain(
  'src/services/teacherQuestionInbox.service.js',
  [
    'assigned_teacher_id = ?',
    'sanitizeQuestionSearchTerm',
    'assertTeacherIsOperational',
    'teacher_pinned_at',
    'LIMIT ? OFFSET ?',
  ],
  'inbox service ownership + pagination'
);

mustContain(
  'src/controllers/teacherQuestions.controller.js',
  ['getTeacherQuestions', 'patchTeacherQuestionPin', 'getTeacherQuestionStudentContextHandler'],
  'inbox controller'
);

mustContain(
  'src/routes/teacher.routes.js',
  ["'/questions'", 'patchTeacherQuestionPin', 'student-context'],
  'inbox routes'
);

mustNotContain(
  'src/services/teacherQuestionInbox.service.js',
  ['req.body.assignedTeacherId', 'user_id:'],
  'inbox DTO privacy'
);

mustContain(
  'src/services/teacherQuestionStudentContext.service.js',
  ['assigned_teacher_id = ?', 'questionCount'],
  'student context scoped'
);

mustNotContain(
  'src/services/teacherQuestionStudentContext.service.js',
  ['userId:', 'studentUserId:'],
  'context hides student user id'
);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
