/**
 * Question Bank integrity layer — validators, logging, SQL guards.
 */
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  validateQuestionIntegrity,
  assertPersistedQuestionIntegrity,
} from '../src/services/questionBankIntegrity.service.js';
import { standardMcqOptions } from './fixtures/standardMcqOptions.js';
import { ApiError } from '../src/utils/apiError.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function assert(condition, message) {
  if (!condition) throw new Error(`[verify-question-bank-integrity] ${message}`);
}

function mustContain(fileRel, needles, label) {
  const filePath = path.join(root, fileRel);
  assert(existsSync(filePath), `missing file: ${fileRel}`);
  const text = readFileSync(filePath, 'utf8');
  for (const needle of needles) {
    assert(text.includes(needle), `${label}: expected "${needle}" in ${fileRel}`);
  }
}

function testValidateQuestionIntegrity() {
  const result = validateQuestionIntegrity(
    { question_text: 'Q?', marks: 1, course_id: 1 },
    standardMcqOptions,
    { operation: 'create' }
  );
  assert(result.options.length === 4, 'returns 4 normalized options');

  let caught = null;
  try {
    validateQuestionIntegrity({ question_text: '', marks: 1 }, standardMcqOptions);
  } catch (error) {
    caught = error;
  }
  assert(caught instanceof ApiError, 'rejects empty question text');

  caught = null;
  try {
    validateQuestionIntegrity(
      { question_text: 'Q?', marks: 1 },
      standardMcqOptions.map((o) => ({ ...o, is_correct: true }))
    );
  } catch (error) {
    caught = error;
  }
  assert(caught instanceof ApiError && caught.code === 'MULTIPLE_CORRECT_OPTIONS', 'rejects duplicate correct');
}

function testStaticWiring() {
  mustContain(
    'src/services/questionBankIntegrity.service.js',
    [
      'validateQuestionIntegrity',
      'assertPersistedQuestionIntegrity',
      'Never auto-fix silently',
      'ORPHAN_OPTION_MAPPING',
    ],
    'integrity service'
  );
  mustContain(
    'src/services/questionBankIntegrityLog.js',
    ['INVALID_PAYLOAD_ATTEMPT', 'VALIDATION_FAILURE', 'TRANSACTION_ROLLBACK'],
    'integrity logging'
  );
  mustContain(
    'src/sql/migrations/question_options_integrity_hardening.sql',
    ['trg_qo_max_four_before_insert', 'chk_option_is_correct_bool'],
    'sql hardening'
  );
  mustContain(
    'src/services/createQuestion.service.js',
    ['validateQuestionIntegrity', 'assertPersistedQuestionIntegrity', 'logTransactionRollback'],
    'create wiring'
  );
  mustContain(
    'src/services/questions.service.js',
    ['validateQuestionIntegrity', 'assertPersistedQuestionIntegrity'],
    'update wiring'
  );
}

assert(typeof assertPersistedQuestionIntegrity === 'function', 'assertPersistedQuestionIntegrity exported');

try {
  testValidateQuestionIntegrity();
  testStaticWiring();
  console.log('verify-question-bank-integrity: OK');
} catch (error) {
  console.error(error.message || error);
  process.exit(1);
}
