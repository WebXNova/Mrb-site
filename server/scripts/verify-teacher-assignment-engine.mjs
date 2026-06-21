/**
 * Static checks: teacher assignment engine wiring (no live MySQL).
 */
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function mustContain(fileRel, needles, label) {
  const p = path.join(root, fileRel);
  if (!existsSync(p)) throw new Error(`[verify-teacher-assignment-engine] missing file: ${fileRel}`);
  const text = readFileSync(p, 'utf8');
  for (const n of needles) {
    if (!text.includes(n)) {
      throw new Error(`[verify-teacher-assignment-engine] ${label}: expected "${n}" in ${fileRel}`);
    }
  }
}

try {
  mustContain(
    'src/services/teacherAssignment.service.js',
    [
      'assignTeacherForStudentQuestion',
      'teacher_subjects',
      'rejectClientTeacherRouting',
      'TEACHER_NOT_AVAILABLE',
      'least_pending_load',
      'teacher.assignment.resolved',
      'teacher.assignment.unavailable',
    ],
    'assignment engine'
  );

  mustContain(
    'src/services/studentQuestionCreate.service.js',
    ['assignTeacherForStudentQuestion'],
    'create service uses assignment engine'
  );

  const createText = readFileSync(path.join(root, 'src/services/studentQuestionCreate.service.js'), 'utf8');
  if (createText.includes('listOperationalTeachersForSubject')) {
    throw new Error('[verify-teacher-assignment-engine] studentQuestionCreate still imports listOperationalTeachersForSubject');
  }

  mustContain(
    'src/controllers/studentQuestions.controller.js',
    ['rejectClientTeacherRouting', 'rejectTamperedIdentityFields'],
    'controller guards'
  );

  mustContain(
    'src/sql/schema.sql',
    ['teacher_subjects', 'assigned_teacher_id', 'idx_sq_teacher_inbox'],
    'schema'
  );

  console.log('verify-teacher-assignment-engine: OK');
} catch (e) {
  console.error(e.message || e);
  process.exit(1);
}
