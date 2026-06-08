/**
 * Question Bank difficulty validation — create/update/list consistency.
 */
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  QUESTION_DIFFICULTY_MESSAGE,
  QUESTION_DIFFICULTIES,
  optionalQuestionDifficultySchema,
  questionListQuerySchema,
} from '../src/validators/questionList.schema.js';
import { createQuestionBodySchema, updateQuestionBodySchema } from '../src/validators/questionWrite.schema.js';
import { standardMcqOptions } from './fixtures/standardMcqOptions.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function assert(condition, message) {
  if (!condition) throw new Error(`[verify-question-difficulty] ${message}`);
}

function expectDifficultyError(result, label) {
  assert(!result.success, `${label} must fail`);
  const fieldErrors = result.error.flatten().fieldErrors;
  assert(Array.isArray(fieldErrors.difficulty), `${label} must include difficulty field error`);
  assert(
    fieldErrors.difficulty.some((m) => String(m) === QUESTION_DIFFICULTY_MESSAGE),
    `${label} must use shared difficulty error message`
  );
}

const mcqOptions = standardMcqOptions;

const writeBase = {
  course_id: 1,
  question_text: 'Sample?',
  marks: 1,
  options: mcqOptions,
  question_type: 'mcq',
};

function testCreateDifficulty() {
  for (const value of QUESTION_DIFFICULTIES) {
    const parsed = createQuestionBodySchema.safeParse({ ...writeBase, difficulty: value });
    assert(parsed.success && parsed.data.difficulty === value, `create accepts ${value}`);
  }

  assert(createQuestionBodySchema.safeParse(writeBase).success, 'create without difficulty');
  assert(
    createQuestionBodySchema.safeParse({ ...writeBase, difficulty: '' }).success &&
      createQuestionBodySchema.parse({ ...writeBase, difficulty: '' }).difficulty == null,
    'create empty difficulty normalizes to null'
  );

  for (const invalid of ['superHard', 'abc', '123', 'extreme']) {
    expectDifficultyError(
      createQuestionBodySchema.safeParse({ ...writeBase, difficulty: invalid }),
      `create ${invalid}`
    );
  }
}

function testUpdateDifficulty() {
  const updateBase = { ...writeBase, difficulty: 'medium' };

  for (const value of QUESTION_DIFFICULTIES) {
    assert(updateQuestionBodySchema.safeParse({ ...updateBase, difficulty: value }).success, `update accepts ${value}`);
  }

  for (const invalid of ['superHard', 'abc', '123']) {
    expectDifficultyError(
      updateQuestionBodySchema.safeParse({ ...updateBase, difficulty: invalid }),
      `update ${invalid}`
    );
  }
}

function testListDifficultyFilter() {
  assert(questionListQuerySchema.safeParse({ difficulty: 'hard' }).success, 'list filter hard');
  expectDifficultyError(questionListQuerySchema.safeParse({ difficulty: 'superHard' }), 'list superHard');
  expectDifficultyError(questionListQuerySchema.safeParse({ difficulty: 'abc' }), 'list abc');
}

function testSharedSchemaSource() {
  const writeSchema = readFileSync(path.join(root, 'src/validators/questionWrite.schema.js'), 'utf8');
  const listSchema = readFileSync(path.join(root, 'src/validators/questionList.schema.js'), 'utf8');

  assert(writeSchema.includes('optionalQuestionDifficultySchema'), 'write schema uses shared difficulty schema');
  assert(listSchema.includes('QUESTION_DIFFICULTY_MESSAGE'), 'list schema exports shared message');
  assert(
    writeSchema.split('optionalQuestionDifficultySchema').length - 1 >= 2,
    'create and update both use optionalQuestionDifficultySchema'
  );
  assert(!writeSchema.includes('nullableTrimmedString,\n      difficulty'), 'create must not use free-text difficulty');
}

function testOptionalSchemaUnit() {
  assert(optionalQuestionDifficultySchema.safeParse('easy').success, 'shared schema easy');
  assert(!optionalQuestionDifficultySchema.safeParse('superHard').success, 'shared schema rejects superHard');
}

try {
  testOptionalSchemaUnit();
  testCreateDifficulty();
  testUpdateDifficulty();
  testListDifficultyFilter();
  testSharedSchemaSource();
  console.log('verify-question-difficulty: OK');
} catch (e) {
  console.error(e.message || e);
  process.exit(1);
}
