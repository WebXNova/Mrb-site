/**
 * Aiken multi-question parser regression tests.
 * Run: node src/services/aikenParser.multi.test.examples.mjs
 */
import { parseAiken, parseAikenDocument } from './aikenParser.js';
import { validateAikenQuestions } from './aikenValidator.js';
import { previewAikenImport } from './questionImportService.js';

/** @param {number} n @param {{ compact?: boolean, mixedLabels?: boolean }} [opts] */
function buildQuestionBlock(n, opts = {}) {
  const { compact = false, mixedLabels = false } = opts;
  const stem = `Question ${n}: What is ${n} + ${n}?`;
  const lines = [stem];
  const labels = mixedLabels
    ? [
        ['A', 'A:'],
        ['B', 'B)'],
        ['C', 'C:'],
        ['D', 'D)'],
      ]
    : [
        ['A', 'A)'],
        ['B', 'B)'],
        ['C', 'C)'],
        ['D', 'D)'],
      ];

  for (const [key, prefix] of labels) {
    lines.push(`${prefix} Option ${key} for Q${n}`);
  }

  lines.push(`ANSWER: ${labels[n % 4][0]}`);

  if (n % 5 === 0) {
    lines.push('');
    lines.push('EXPLANATION:');
    lines.push(`Because ${n} plus ${n} equals ${n + n}.`);
  }

  if (!compact) {
    lines.push('');
  }

  return lines.join('\n');
}

/** @param {number} count @param {{ compact?: boolean, mixedLabels?: boolean }} [opts] */
function buildMultiQuestionDocument(count, opts = {}) {
  return Array.from({ length: count }, (_, index) => buildQuestionBlock(index + 1, opts)).join('\n');
}

const SINGLE = buildQuestionBlock(1).trimEnd();

const TWO_WITH_BLANK = buildMultiQuestionDocument(2);

const TWO_NO_BLANK_BETWEEN = `What is AI?
A) Artificial Intelligence
B) Animal Intelligence
C) Artificial Interaction
D) Automatic Internet
ANSWER: A
What is ML?
A) Machine Learning
B) Manual Learning
C) Meta Language
D) Model Logic
ANSWER: B`;

const TWO_EXPLANATION_NO_BLANK_AFTER = `What is AI?

A) Artificial Intelligence
B) Animal Intelligence
C) Artificial Interaction
D) Automatic Internet

ANSWER: A

EXPLANATION:
AI means machines doing human-like tasks.
What is ML?

A) Machine Learning
B) Manual Learning
C) Meta Language
D) Model Logic

ANSWER: B`;

const INVALID_MIDDLE = `${buildQuestionBlock(1)}
What is broken?

A) One
B) Two
C) Three
D) Four

ANSWER: Z

${buildQuestionBlock(3)}`;

const MISSING_ANSWER = `Broken question?
A) One
B) Two
C) Three
D) Four

${buildQuestionBlock(2)}`;

const DUPLICATE_LABELS = `Duplicate labels?
A) First
A) Second
B) Two
C) Three
D) Four
ANSWER: A

${buildQuestionBlock(2)}`;

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${message}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${message}`);
  }
}

function runParseCase(name, content, { expectedParsed = null, expectedErrors = null } = {}) {
  console.log(`\n[${name}]`);
  return (async () => {
    try {
      const document = parseAikenDocument(content);
      const parsed = document.questions;
      console.log(`[PARSER_OUTPUT_COUNT] ${parsed.length}`);
      console.log(`[PARSER_ERROR_COUNT] ${document.parseErrors.length}`);

      if (expectedParsed != null) {
        assert(parsed.length === expectedParsed, `parser returns ${expectedParsed} question(s)`);
      }

      if (expectedErrors != null) {
        assert(
          document.parseErrors.length === expectedErrors,
          `parser reports ${expectedErrors} error(s)`
        );
      }

      const { validQuestions, invalidQuestions } = validateAikenQuestions(parsed);
      console.log(`[VALIDATOR_VALID_COUNT] ${validQuestions.length}`);
      console.log(`[VALIDATOR_INVALID_COUNT] ${invalidQuestions.length}`);
      assert(
        validQuestions.length + invalidQuestions.length === parsed.length,
        'valid + invalid equals parsed count'
      );

      const preview = await previewAikenImport(content, undefined, { previewMode: true });
      console.log(`[PREVIEW_IMPORTED_COUNT] ${preview.imported}`);
      console.log(`[PREVIEW_QUESTIONS_COUNT] ${preview.questions.length}`);
      console.log(`[PREVIEW_FAILED_COUNT] ${preview.failed}`);
      assert(
        preview.questions.length === validQuestions.length,
        'preview question count matches validator'
      );
      assert(Boolean(preview.diagnostics), 'preview returns diagnostics object');

      return { parsed, validQuestions, invalidQuestions, preview, document };
    } catch (error) {
      failed += 1;
      console.error(`  ERROR: ${error.code || error.name}: ${error.message}`);
      console.error(`  ✗ unexpected error`);
      return null;
    }
  })();
}

console.log('aikenParser multi-question regression tests\n');

async function runAll() {
  await runParseCase('1-question', SINGLE, { expectedParsed: 1, expectedErrors: 0 });
  await runParseCase('2-questions-blank-separated', TWO_WITH_BLANK, {
    expectedParsed: 2,
    expectedErrors: 0,
  });
  await runParseCase('2-questions-no-blank-between', TWO_NO_BLANK_BETWEEN, {
    expectedParsed: 2,
    expectedErrors: 0,
  });
  await runParseCase('2-questions-explanation-no-blank-after', TWO_EXPLANATION_NO_BLANK_AFTER, {
    expectedParsed: 2,
    expectedErrors: 0,
  });
  await runParseCase('10-questions', buildMultiQuestionDocument(10), {
    expectedParsed: 10,
    expectedErrors: 0,
  });
  await runParseCase('100-questions', buildMultiQuestionDocument(100), {
    expectedParsed: 100,
    expectedErrors: 0,
  });
  await runParseCase('mixed-a-colon-b-paren', buildMultiQuestionDocument(3, { mixedLabels: true }), {
    expectedParsed: 3,
    expectedErrors: 0,
  });

  await runParseCase('invalid-answer-in-middle', INVALID_MIDDLE, {
    expectedParsed: 2,
    expectedErrors: 1,
  });

  await runParseCase('missing-answer-first-block', MISSING_ANSWER, {
    expectedParsed: 1,
    expectedErrors: 1,
  });

  await runParseCase('duplicate-labels-first-block', DUPLICATE_LABELS, {
    expectedParsed: 1,
    expectedErrors: 1,
  });

  const crlf = buildMultiQuestionDocument(5).replace(/\n/g, '\r\n');
  await runParseCase('crlf-5-questions', crlf, { expectedParsed: 5, expectedErrors: 0 });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exitCode = failed > 0 ? 1 : 0;
}

runAll();
