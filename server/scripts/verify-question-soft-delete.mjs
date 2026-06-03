/**
 * Static checks for question soft-delete service.
 */
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function mustContain(fileRel, needles, label) {
  const p = path.join(root, fileRel);
  if (!existsSync(p)) throw new Error(`[verify-question-soft-delete] missing: ${fileRel}`);
  const text = readFileSync(p, 'utf8');
  for (const n of needles) {
    if (!text.includes(n)) {
      throw new Error(`[verify-question-soft-delete] ${label}: expected "${n}" in ${fileRel}`);
    }
  }
}

try {
  mustContain(
    'src/services/questions.service.js',
    [
      'export async function deleteQuestion',
      'FOR UPDATE',
      'SET deleted_at = CURRENT_TIMESTAMP',
      'deleted_by = ?',
      'AND deleted_at IS NULL',
      'connection.rollback()',
      'QuestionNotFoundError',
      'QuestionBankInternalError',
    ],
    'service implementation'
  );
  mustContain(
    'src/errors/questionBank/QuestionBankErrors.js',
    ['QUESTION_NOT_FOUND', 'INVALID_QUESTION_ID', 'INTERNAL_ERROR'],
    'error classes'
  );
  mustContain(
    'src/routes/questions.routes.js',
    ["router.delete('/:id', deleteQuestion)", 'adminSecurityStack'],
    'delete route + security'
  );
  mustContain(
    'src/controllers/questions.controller.js',
    ['export const deleteQuestion', 'deleteQuestionService', 'admin.question.delete', 'QUESTION_DELETED'],
    'controller + audit'
  );
  mustContain(
    'src/validators/questionParams.schema.js',
    ['questionIdParamSchema', '/^[1-9]'],
    'param validation'
  );
  console.log('verify-question-soft-delete: OK');
} catch (e) {
  console.error(e.message || e);
  process.exit(1);
}
