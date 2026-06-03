/**
 * Phase 1 MCQ-only lock — create/update schema + service defense-in-depth.
 */
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  createQuestionBodySchema,
  updateQuestionBodySchema,
  PHASE_1_QUESTION_TYPE,
} from '../src/validators/questionWrite.schema.js';
import {
  assertPhase1QuestionTypeSupported,
  assertQuestionWriteBusinessRules,
} from '../src/services/questions.service.js';
import { ApiError } from '../src/utils/apiError.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function assert(condition, message) {
  if (!condition) throw new Error(`[verify-question-phase1-mcq] ${message}`);
}

function mustContain(fileRel, needles, label) {
  const p = path.join(root, fileRel);
  if (!existsSync(p)) throw new Error(`[verify-question-phase1-mcq] missing file: ${fileRel}`);
  const text = readFileSync(p, 'utf8');
  for (const n of needles) {
    if (!text.includes(n)) {
      throw new Error(`[verify-question-phase1-mcq] ${label}: expected "${n}" in ${fileRel}`);
    }
  }
}

const mcqOptions = [
  { option_text: 'Wrong', is_correct: false },
  { option_text: 'Correct', is_correct: true },
];

const createBase = {
  course_id: 1,
  question_text: 'Sample MCQ?',
  marks: 1,
  options: mcqOptions,
};

const updateBase = {
  ...createBase,
  question_type: PHASE_1_QUESTION_TYPE,
  difficulty: 'easy',
};

function expectQuestionTypeFieldError(result, label) {
  assert(!result.success, `${label} must fail validation`);
  const fieldErrors = result.error.flatten().fieldErrors;
  assert(Array.isArray(fieldErrors.question_type), `${label} must include question_type field error`);
  assert(
    fieldErrors.question_type.some((m) => String(m).includes('mcq')),
    `${label} question_type message must mention mcq`
  );
}

function testCreateSchemaPhase1() {
  const defaultType = createQuestionBodySchema.safeParse(createBase);
  assert(defaultType.success, 'create without question_type defaults to mcq');
  assert(defaultType.data.question_type === PHASE_1_QUESTION_TYPE, 'create default question_type is mcq');

  const explicitMcq = createQuestionBodySchema.safeParse({ ...createBase, question_type: 'mcq' });
  assert(explicitMcq.success, 'create with question_type mcq');

  expectQuestionTypeFieldError(
    createQuestionBodySchema.safeParse({ ...createBase, question_type: 'essay' }),
    'create essay'
  );
  expectQuestionTypeFieldError(
    createQuestionBodySchema.safeParse({ ...createBase, question_type: 'tf' }),
    'create tf'
  );
}

function testUpdateSchemaPhase1() {
  assert(updateQuestionBodySchema.safeParse(updateBase).success, 'valid mcq update');

  expectQuestionTypeFieldError(
    updateQuestionBodySchema.safeParse({ ...updateBase, question_type: 'essay' }),
    'update essay'
  );
  expectQuestionTypeFieldError(
    updateQuestionBodySchema.safeParse({ ...updateBase, question_type: 'tf' }),
    'update tf'
  );

  const essayNoOptions = updateQuestionBodySchema.safeParse({
    ...updateBase,
    question_type: 'essay',
    options: undefined,
  });
  assert(!essayNoOptions.success, 'update essay without options rejected at schema (type + options)');
}

function testServiceDefenseInDepth() {
  let caught = null;
  try {
    assertPhase1QuestionTypeSupported('essay');
  } catch (error) {
    caught = error;
  }
  assert(caught instanceof ApiError, 'essay throws ApiError');
  assert(caught.statusCode === 422, 'essay status 422');
  assert(caught.code === 'UNSUPPORTED_QUESTION_TYPE', 'essay code UNSUPPORTED_QUESTION_TYPE');

  caught = null;
  try {
    assertQuestionWriteBusinessRules({ ...updateBase, question_type: 'tf' });
  } catch (error) {
    caught = error;
  }
  assert(caught instanceof ApiError && caught.code === 'UNSUPPORTED_QUESTION_TYPE', 'write rules reject tf');

  assertPhase1QuestionTypeSupported('mcq');
  assertPhase1QuestionTypeSupported(undefined);
  assertQuestionWriteBusinessRules(updateBase);
}

function testStaticGuards() {
  mustContain(
    'src/validators/questionWrite.schema.js',
    ['PHASE_1_QUESTION_TYPE', 'FUTURE_QUESTION_TYPES', 'phase1QuestionTypeSchema'],
    'schema phase1 constants'
  );
  mustContain(
    'src/services/questions.service.js',
    [
      'assertPhase1QuestionTypeSupported',
      'UNSUPPORTED_QUESTION_TYPE',
      'assertTfBusinessRules',
      'PHASE_1_QUESTION_TYPE',
      'await insertQuestionOptions(connection, id, payload.options)',
    ],
    'service phase1 guards + always reinsert options'
  );

  const serviceText = readFileSync(path.join(root, 'src/services/questions.service.js'), 'utf8');
  assert(
    !serviceText.includes("payload.question_type === 'mcq' && Array.isArray(payload.options)"),
    'update must not conditionally skip option reinsert'
  );
}

try {
  testCreateSchemaPhase1();
  testUpdateSchemaPhase1();
  testServiceDefenseInDepth();
  testStaticGuards();
  console.log('verify-question-phase1-mcq: OK');
} catch (e) {
  console.error(e.message || e);
  process.exit(1);
}
