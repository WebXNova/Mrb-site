/**
 * student_questions schema hardening — static wiring tests.
 *
 * Run: npm run test:student-questions-schema-security
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
  ok(`exists: ${fileRel}`, existsSync(filePath));
  const text = readFileSync(filePath, 'utf8');
  for (const needle of needles) {
    ok(`${label}: "${needle}"`, text.includes(needle));
  }
}

console.log('studentQuestionsSchemaSecurity — acceptance tests\n');

mustContain(
  'src/sql/migrations/student_questions_integrity_hardening.sql',
  [
    'fk_sq_user_id',
    'fk_sq_course_id',
    'fk_sq_subject_id',
    'fk_sq_assigned_teacher_id',
    'fk_sq_answered_by',
    'idx_sq_subject_id',
    'trg_sq_assigned_teacher_role_before_insert',
    'ALGORITHM=INPLACE',
  ],
  'forward migration'
);

mustContain(
  'src/sql/migrations/student_questions_integrity_hardening_rollback.sql',
  ['DROP FOREIGN KEY fk_sq_course_id', 'sp_sq_rollback_drop_indexes'],
  'rollback migration'
);

mustContain(
  'src/sql/migrations/student_questions_orphan_audit.sql',
  ['orphan_user_id', 'orphan_course_id', 'subject_course_mismatch'],
  'orphan audit'
);

mustContain(
  'src/db/ensureStudentQuestionsIntegritySchema.js',
  ['auditStudentQuestionsOrphans', 'orphans_detected', 'fk_sq_assigned_teacher_id'],
  'node integrity module'
);

mustContain(
  'src/sql/schema.sql',
  ['fk_sq_course_id', 'fk_sq_subject_id', 'idx_sq_created_at'],
  'greenfield schema'
);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
