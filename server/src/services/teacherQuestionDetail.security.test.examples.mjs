/**
 * Teacher Question Detail — security acceptance tests.
 *
 * Run: npm run test:teacher-question-detail-security
 */
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  mapDbStatusToStudentStatus,
  parseStudentQuestionId,
} from '../services/studentQuestionStudentView.service.js';
import { mapRowToTeacherQuestionDetail } from '../services/teacherQuestionDetail.service.js';

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

console.log('teacherQuestionDetailSecurity — acceptance tests\n');

mustContain(
  'src/services/teacherQuestionDetail.service.js',
  [
    'WHERE sq.id = ? AND sq.assigned_teacher_id = ?',
    'FOR UPDATE',
    'seen_at = COALESCE(seen_at, CURRENT_TIMESTAMP)',
    'mapRowToTeacherQuestionDetail',
  ],
  'ownership + mark seen transaction'
);

mustNotContain(
  'src/services/teacherQuestionDetail.service.js',
  ['student_email', 'assignedTeacherId:', 'userId:'],
  'teacher DTO privacy'
);

mustContain(
  'src/controllers/teacherQuestions.controller.js',
  ['openTeacherQuestionDetail', 'QUESTION_ACCESS_DENIED', 'logTeacherQuestionOpened'],
  'controller wiring'
);

mustContain(
  'src/routes/teacher.routes.js',
  ['/questions/:questionId', 'getTeacherQuestionById'],
  'teacher route'
);

mustContain(
  'src/services/secureMedia.service.js',
  ['assertTeacherAssignedStudentQaMedia', "options.role === 'teacher'"],
  'teacher media ACL'
);

mustContain(
  'src/security/cee/protectionGrid.js',
  ['uploads_student_qa', 'student_qa_media', 'studentQaMediaGuard'],
  'protection grid student-qa'
);

ok('parseStudentQuestionId rejects invalid', parseStudentQuestionId('abc') === null);
ok('parseStudentQuestionId accepts valid', parseStudentQuestionId('42') === 42);

ok(
  'pending + seen_at maps to seen',
  mapDbStatusToStudentStatus({ status: 'pending', seen_at: '2026-01-01' }) === 'seen'
);

const detail = mapRowToTeacherQuestionDetail({
  id: 1,
  subject: 'physics',
  subject_title: 'Physics',
  title: 'Test',
  body: 'Body text',
  status: 'pending',
  seen_at: '2026-01-01',
  student_name: 'Ayesha',
  course_name: 'MDCAT',
  created_at: '2026-01-01',
  updated_at: '2026-01-02',
});
ok('detail has studentName', detail?.studentName === 'Ayesha');
ok('detail has courseName', detail?.courseName === 'MDCAT');
ok('detail has no assignedTeacherId', detail?.assignedTeacherId === undefined);
ok('seen maps canAnswer true', detail?.canAnswer === true);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
