/**
 * Correct-answer persistence — validateOptions + createQuestionService wiring.
 */
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { validateOptions } from '../src/validators/questionOptions.validation.js';
import { createQuestionBodySchema } from '../src/validators/questionWrite.schema.js';
import { standardMcqOptions } from './fixtures/standardMcqOptions.js';
import { ApiError } from '../src/utils/apiError.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function assert(condition, message) {
  if (!condition) throw new Error(`[verify-question-correct-answer] ${message}`);
}

function mustContain(fileRel, needles, label) {
  const filePath = path.join(root, fileRel);
  assert(existsSync(filePath), `missing file: ${fileRel}`);
  const text = readFileSync(filePath, 'utf8');
  for (const needle of needles) {
    assert(text.includes(needle), `${label}: expected "${needle}" in ${fileRel}`);
  }
}

function testValidateOptions() {
  const normalized = validateOptions(standardMcqOptions);
  assert(normalized.length === 4, 'must return 4 options');
  assert(normalized.filter((o) => o.is_correct).length === 1, 'exactly one correct');
  assert(normalized.map((o) => o.option_key).join('') === 'ABCD', 'keys A–D ordered');

  let caught = null;
  try {
    validateOptions([
      { option_key: 'A', option_text: 'A', is_correct: true },
      { option_key: 'B', option_text: 'B', is_correct: true },
      { option_key: 'C', option_text: 'C', is_correct: false },
      { option_key: 'D', option_text: 'D', is_correct: false },
    ]);
  } catch (error) {
    caught = error;
  }
  assert(caught instanceof ApiError && caught.code === 'MULTIPLE_CORRECT_OPTIONS', 'reject multiple correct');

  caught = null;
  try {
    validateOptions(standardMcqOptions.slice(0, 2));
  } catch (error) {
    caught = error;
  }
  assert(caught instanceof ApiError && caught.code === 'INVALID_OPTION_COUNT', 'reject wrong count');
}

function testCreateSchema() {
  const payload = {
    course_id: 1,
    question_text: 'Sample?',
    marks: 1,
    options: standardMcqOptions,
  };
  assert(createQuestionBodySchema.safeParse(payload).success, 'schema accepts 4-option payload');

  const noCorrect = {
    ...payload,
    options: standardMcqOptions.map((o) => ({ ...o, is_correct: false })),
  };
  assert(!createQuestionBodySchema.safeParse(noCorrect).success, 'schema rejects no correct');
}

function testStaticWiring() {
  mustContain(
    'src/services/createQuestion.service.js',
    [
      'Frontend correctness is not trusted',
      'Partial inserts are forbidden',
      'beginTransaction',
      'assertExactlyOneCorrectInDatabase',
      'option_key',
    ],
    'createQuestion.service'
  );
  mustContain(
    'src/controllers/questions.controller.js',
    ['createQuestion', 'createQuestionService'],
    'controller wiring'
  );
  mustContain(
    'src/sql/migrations/question_options_option_key.sql',
    ['trg_qo_single_correct_before_insert', 'uq_question_option_key'],
    'db migration'
  );
}

try {
  testValidateOptions();
  testCreateSchema();
  testStaticWiring();
  console.log('verify-question-correct-answer: OK');
} catch (error) {
  console.error(error.message || error);
  process.exit(1);
}
