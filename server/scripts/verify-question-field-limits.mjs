/**
 * Question Bank write field length limits — POST/PUT validation before DB access.
 */
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  MAX_OPTION_TEXT_LENGTH,
  MAX_QUESTION_EXPLANATION_LENGTH,
  MAX_QUESTION_TEXT_LENGTH,
  MAX_QUESTION_TOPIC_LENGTH,
  createQuestionBodySchema,
  updateQuestionBodySchema,
} from '../src/validators/questionWrite.schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function assert(condition, message) {
  if (!condition) throw new Error(`[verify-question-field-limits] ${message}`);
}

function repeat(char, count) {
  return char.repeat(count);
}

const mcqOptions = [
  { option_text: 'Wrong', is_correct: false },
  { option_text: 'Correct', is_correct: true },
];

const writeBase = {
  course_id: 1,
  question_text: 'Valid question?',
  marks: 1,
  options: mcqOptions,
  question_type: 'mcq',
};

function expectFieldMaxError(result, field, max, label) {
  assert(!result.success, `${label} must fail when ${field} exceeds ${max}`);
  const fieldErrors = result.error.flatten().fieldErrors;
  const nestedOptionError =
    field === 'option_text' &&
    Array.isArray(fieldErrors.options) &&
    fieldErrors.options.some((m) => String(m).includes(String(max)));
  const directError = Array.isArray(fieldErrors[field]) && fieldErrors[field].some((m) => String(m).includes(String(max)));
  assert(nestedOptionError || directError, `${label} must return structured ${field} max-length error`);
}

function testValidInput(schema, label) {
  const parsed = schema.safeParse({
    ...writeBase,
    topic: 'Biology',
    explanation: 'Because cells.',
    options: [
      { option_text: repeat('a', MAX_OPTION_TEXT_LENGTH), is_correct: false },
      { option_text: 'B', is_correct: true },
    ],
    question_text: repeat('q', MAX_QUESTION_TEXT_LENGTH),
  });
  assert(parsed.success, `${label} accepts payloads at max allowed lengths`);
}

function testBoundaryInput(schema, label) {
  assert(
    schema.safeParse({
      ...writeBase,
      topic: repeat('t', MAX_QUESTION_TOPIC_LENGTH),
      explanation: repeat('e', MAX_QUESTION_EXPLANATION_LENGTH),
      question_text: repeat('q', MAX_QUESTION_TEXT_LENGTH),
      options: [
        { option_text: repeat('o', MAX_OPTION_TEXT_LENGTH), is_correct: false },
        { option_text: 'ok', is_correct: true },
      ],
    }).success,
    `${label} accepts exact boundary lengths`
  );
}

function testOversizedInput(schema, label) {
  expectFieldMaxError(
    schema.safeParse({ ...writeBase, question_text: repeat('q', MAX_QUESTION_TEXT_LENGTH + 1) }),
    'question_text',
    MAX_QUESTION_TEXT_LENGTH,
    `${label} question_text oversized`
  );
  expectFieldMaxError(
    schema.safeParse({ ...writeBase, topic: repeat('t', MAX_QUESTION_TOPIC_LENGTH + 1) }),
    'topic',
    MAX_QUESTION_TOPIC_LENGTH,
    `${label} topic oversized`
  );
  expectFieldMaxError(
    schema.safeParse({ ...writeBase, explanation: repeat('e', MAX_QUESTION_EXPLANATION_LENGTH + 1) }),
    'explanation',
    MAX_QUESTION_EXPLANATION_LENGTH,
    `${label} explanation oversized`
  );
  expectFieldMaxError(
    schema.safeParse({
      ...writeBase,
      options: [
        { option_text: repeat('o', MAX_OPTION_TEXT_LENGTH + 1), is_correct: false },
        { option_text: 'ok', is_correct: true },
      ],
    }),
    'option_text',
    MAX_OPTION_TEXT_LENGTH,
    `${label} option_text oversized`
  );
}

function testControllerValidatesBeforeService() {
  const controllerPath = path.join(root, 'src/controllers/questions.controller.js');
  if (!existsSync(controllerPath)) throw new Error('[verify-question-field-limits] missing controller');
  const controller = readFileSync(controllerPath, 'utf8');

  const postValidateIdx = controller.indexOf('createQuestionBodySchema.safeParse(req.body)');
  const postServiceIdx = controller.indexOf('createMcqQuestion(parsed.data');
  assert(postValidateIdx >= 0 && postServiceIdx > postValidateIdx, 'POST validates before createMcqQuestion');

  const putValidateIdx = controller.indexOf('updateQuestionBodySchema.safeParse(req.body)');
  const putServiceIdx = controller.indexOf('updateQuestion(questionId, parsed.data');
  assert(putValidateIdx >= 0 && putServiceIdx > putValidateIdx, 'PUT validates before updateQuestion');
}

try {
  testValidInput(createQuestionBodySchema, 'POST');
  testBoundaryInput(createQuestionBodySchema, 'POST');
  testOversizedInput(createQuestionBodySchema, 'POST');

  testValidInput(updateQuestionBodySchema, 'PUT');
  testBoundaryInput(updateQuestionBodySchema, 'PUT');
  testOversizedInput(updateQuestionBodySchema, 'PUT');

  testControllerValidatesBeforeService();
  console.log('verify-question-field-limits: OK');
} catch (e) {
  console.error(e.message || e);
  process.exit(1);
}
