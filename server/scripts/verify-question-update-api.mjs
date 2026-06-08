/**
 * Question update API — schema unit checks + static architecture/security checks.
 */
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { updateQuestionBodySchema } from '../src/validators/questionWrite.schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function assert(condition, message) {
  if (!condition) throw new Error(`[verify-question-update-api] ${message}`);
}

function mustContain(fileRel, needles, label) {
  const p = path.join(root, fileRel);
  if (!existsSync(p)) throw new Error(`[verify-question-update-api] missing file: ${fileRel}`);
  const text = readFileSync(p, 'utf8');
  for (const n of needles) {
    if (!text.includes(n)) {
      throw new Error(`[verify-question-update-api] ${label}: expected "${n}" in ${fileRel}`);
    }
  }
}

const validPayload = {
  course_id: 37,
  subject_id: 17,
  topic: 'Python Basics',
  difficulty: 'medium',
  question_type: 'mcq',
  question_text: 'What is a Python tuple?',
  explanation: 'Tuple is immutable.',
  marks: 2,
  options: [
    { option_text: 'Mutable list', is_correct: false },
    { option_text: 'Immutable collection', is_correct: true },
    { option_text: 'Function', is_correct: false },
    { option_text: 'Class', is_correct: false },
  ],
};

function testSchemaValidation() {
  assert(updateQuestionBodySchema.safeParse(validPayload).success, 'valid update payload');

  const textOnly = updateQuestionBodySchema.safeParse({
    ...validPayload,
    question_text: 'Updated question text only',
  });
  assert(textOnly.success, 'update question text');

  const difficulty = updateQuestionBodySchema.safeParse({ ...validPayload, difficulty: 'hard' });
  assert(difficulty.success, 'update difficulty');

  const marks = updateQuestionBodySchema.safeParse({ ...validPayload, marks: 5 });
  assert(marks.success, 'update marks');

  const replaceOptions = updateQuestionBodySchema.safeParse({
    ...validPayload,
    options: [
      { option_key: 'A', option_text: 'A', is_correct: false },
      { option_key: 'B', option_text: 'B', is_correct: true },
      { option_key: 'C', option_text: 'C', is_correct: false },
      { option_key: 'D', option_text: 'D', is_correct: false },
    ],
  });
  assert(replaceOptions.success, 'replace options');

  const changeCorrect = updateQuestionBodySchema.safeParse({
    ...validPayload,
    options: [
      { option_text: 'Mutable list', is_correct: true },
      { option_text: 'Immutable collection', is_correct: false },
      { option_text: 'Function', is_correct: false },
      { option_text: 'Class', is_correct: false },
    ],
  });
  assert(changeCorrect.success, 'change correct answer');

  assert(updateQuestionBodySchema.safeParse({ ...validPayload, course_id: 999999 }).success, 'schema allows positive course_id; service validates FK');
  assert(!updateQuestionBodySchema.safeParse({ ...validPayload, marks: 0 }).success, 'invalid marks');
  assert(!updateQuestionBodySchema.safeParse({ ...validPayload, options: [{ option_text: 'A', is_correct: true }] }).success, 'insufficient options');
  assert(
    !updateQuestionBodySchema.safeParse({
      ...validPayload,
      options: [
        { option_key: 'A', option_text: '1', is_correct: false },
        { option_key: 'B', option_text: '2', is_correct: false },
        { option_key: 'C', option_text: '3', is_correct: false },
        { option_key: 'D', option_text: '4', is_correct: false },
      ],
    }).success,
    'no correct answer'
  );
  assert(
    !updateQuestionBodySchema.safeParse({
      ...validPayload,
      options: [
        { option_key: 'A', option_text: '1', is_correct: true },
        { option_key: 'B', option_text: '2', is_correct: true },
        { option_key: 'C', option_text: '3', is_correct: false },
        { option_key: 'D', option_text: '4', is_correct: false },
      ],
    }).success,
    'multiple correct answers'
  );

  const essayUpdate = updateQuestionBodySchema.safeParse({ ...validPayload, question_type: 'essay' });
  assert(!essayUpdate.success, 'reject update question_type essay (Phase 1 MCQ only)');
  assert(
    essayUpdate.error.flatten().fieldErrors.question_type?.length,
    'essay update returns structured question_type field error'
  );

  const tfUpdate = updateQuestionBodySchema.safeParse({ ...validPayload, question_type: 'tf' });
  assert(!tfUpdate.success, 'reject update question_type tf (Phase 1 MCQ only)');
}

function testStaticArchitecture() {
  mustContain(
    'src/routes/questions.routes.js',
    ["router.put('/:id', questionBankWriteRateLimit, putQuestion)", 'adminSecurityStack', 'enforcePolicy'],
    'route registration + security'
  );
  mustContain(
    'src/controllers/questions.controller.js',
    ['export const putQuestion', 'updateQuestionBodySchema', 'updateQuestion('],
    'controller wiring'
  );
  mustContain(
    'src/services/questions.service.js',
    [
      'export async function updateQuestion',
      'FOR UPDATE',
      'UPDATE question_bank',
      'DELETE FROM question_options WHERE question_id = ?',
      'INSERT INTO question_options',
      'option_key',
      'assertPhase1QuestionTypeSupported',
      "action: 'admin.question.update'",
      'QUESTION_UPDATED',
      'connection.rollback()',
    ],
    'service transaction + audit'
  );

  const controllerText = readFileSync(path.join(root, 'src/controllers/questions.controller.js'), 'utf8');
  assert(!controllerText.includes('mysqlPool'), 'controller must not query database');
  assert(!controllerText.includes('INSERT INTO'), 'controller must not contain SQL');
}

function testUpdateAuditCommitOrdering() {
  const serviceText = readFileSync(path.join(root, 'src/services/questions.service.js'), 'utf8');
  const fnStart = serviceText.indexOf('export async function updateQuestion');
  assert(fnStart >= 0, 'updateQuestion must exist');
  const fnEnd = serviceText.indexOf('export async function deleteQuestion', fnStart);
  const updateFn = serviceText.slice(fnStart, fnEnd);

  const commitIdx = updateFn.indexOf('await connection.commit()');
  const auditIdx = updateFn.indexOf("action: 'admin.question.update'");
  const rollbackIdx = updateFn.indexOf('await connection.rollback()');

  assert(commitIdx >= 0, 'updateQuestion must commit transaction');
  assert(auditIdx >= 0, 'updateQuestion must log admin.question.update audit');
  assert(commitIdx < auditIdx, 'audit log must run only after connection.commit()');

  const tryCatchAuditIdx = updateFn.indexOf('activity log failed after successful update commit');
  assert(tryCatchAuditIdx > auditIdx, 'post-commit audit failure must not roll back committed data');

  const catchBlock = updateFn.slice(rollbackIdx);
  assert(!catchBlock.includes("action: 'admin.question.update'"), 'rollback path must not emit QUESTION_UPDATED audit');

  const controllerText = readFileSync(path.join(root, 'src/controllers/questions.controller.js'), 'utf8');
  assert(controllerText.includes("action: 'admin.question.create'"), 'create audit remains in controller');
  assert(controllerText.includes("action: 'admin.question.delete'"), 'delete audit remains in controller');
  assert(!controllerText.includes("action: 'admin.question.update'"), 'update audit stays in service after commit');
}

try {
  testSchemaValidation();
  testStaticArchitecture();
  testUpdateAuditCommitOrdering();
  console.log('verify-question-update-api: OK');
  console.log('');
  console.log('Manual API test examples (admin session + CSRF required):');
  console.log('  PUT /api/questions/15  — update question text / difficulty / marks / options');
  console.log('  PUT /api/questions/15  — invalid course_id → COURSE_NOT_FOUND');
  console.log('  PUT /api/questions/15  — invalid subject_id → SUBJECT_NOT_FOUND');
  console.log('  PUT /api/questions/99999 — QUESTION_NOT_FOUND');
  console.log('  PUT /api/questions/15  — 0 correct options → NO_CORRECT_OPTION');
  console.log('  PUT /api/questions/15  — 2+ correct options → MULTIPLE_CORRECT_OPTIONS');
  console.log('  PUT /api/questions/15  — rollback: send invalid payload mid-test; DB stays unchanged');
} catch (e) {
  console.error(e.message || e);
  process.exit(1);
}
