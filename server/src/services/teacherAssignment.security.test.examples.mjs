/**
 * Teacher Assignment Engine — security acceptance tests (static wiring).
 *
 * Run: npm run test:teacher-assignment-security
 */
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { rejectClientTeacherRouting } from '../services/teacherAssignment.service.js';
import { ApiError } from '../utils/apiError.js';

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

console.log('teacherAssignmentSecurity — acceptance tests\n');

mustContain(
  'src/services/teacherAssignment.service.js',
  [
    'teacher_subjects',
    'assignTeacherForStudentQuestion',
    'rejectClientTeacherRouting',
    'TEACHER_UNAVAILABLE_PUBLIC_MESSAGE',
    'least_pending_load',
    'teacher.assignment.routing',
    'teacher.assignment.resolved',
    'teacher.assignment.unavailable',
    'FOR UPDATE',
    'is_active',
    "u.status = 'active'",
  ],
  'assignment engine'
);

mustContain(
  'src/services/studentQuestionCreate.service.js',
  ['assignTeacherForStudentQuestion', 'assigned_teacher_id'],
  'create path uses server assignment'
);

mustContain(
  'src/controllers/studentQuestions.controller.js',
  ['rejectClientTeacherRouting', 'rejectTamperedIdentityFields'],
  'controller blocks client routing'
);

mustContain(
  'src/validators/studentQuestionCreate.schema.js',
  ['.strict()', 'subjectId'],
  'strict schema — no teacherId'
);

// Runtime: rejectClientTeacherRouting
try {
  rejectClientTeacherRouting({ teacherId: 99 });
  ok('rejectClientTeacherRouting throws on teacherId', false);
} catch (error) {
  ok(
    'rejectClientTeacherRouting throws on teacherId',
    error instanceof ApiError && error.code === 'TEACHER_ROUTING_FORBIDDEN'
  );
}

try {
  rejectClientTeacherRouting({ subjectId: 1, body: 'hello world test' });
  ok('rejectClientTeacherRouting allows clean payload', true);
} catch {
  ok('rejectClientTeacherRouting allows clean payload', false);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
