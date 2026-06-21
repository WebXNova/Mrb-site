/**
 * Aiken import validation parity tests.
 * Run: node src/services/aikenImportValidationPipeline.test.examples.mjs
 */
import { MAX_OPTION_TEXT_LENGTH } from '../validators/questionWrite.schema.js';
import { previewAikenImport } from './questionImportService.js';
import { partitionParsedAikenForImport, partitionAikenDocumentForImport } from './aikenImportValidationPipeline.js';
import { parseAiken, parseAikenDocument } from './aikenParser.js';
import { validateAikenQuestions } from './aikenValidator.js';

function buildValidBlock(stem = 'What is 2 + 2?', options = null) {
  const opts =
    options ??
    [
      ['A', 'Four'],
      ['B', 'Five'],
      ['C', 'Six'],
      ['D', 'Seven'],
    ];
  const lines = [stem];
  for (const [key, text] of opts) {
    lines.push(`${key}) ${text}`);
  }
  lines.push('ANSWER: A');
  lines.push('');
  return lines.join('\n');
}

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

function runCase(name, fn) {
  console.log(`\n[${name}]`);
  return Promise.resolve()
    .then(() => fn())
    .catch((error) => {
      failed += 1;
      console.error(`  ✗ threw: ${error.message}`);
    });
}

const importContext = { course_id: 1, marks: 1, subject_id: null, topic: null, difficulty: null };

async function runAll() {
await runCase('valid question passes preview and partition', async () => {
  const content = buildValidBlock();
  const parsed = parseAiken(content);
  const aiken = validateAikenQuestions(parsed);
  const partitioned = partitionParsedAikenForImport(parsed, importContext);
  const preview = await previewAikenImport(content, importContext, { previewMode: false });

  assert(aiken.validQuestions.length === 1, 'aiken validator accepts question');
  assert(partitioned.validQuestions.length === 1, 'partition accepts question');
  assert(preview.imported === 1, 'preview imported count is 1');
  assert(preview.questions.length === 1, 'preview returns question');
  assert(partitioned.errors.length === 0, 'partition has no errors');
});

await runCase('option text over schema max fails preview (was import-only)', async () => {
  const longText = 'x'.repeat(MAX_OPTION_TEXT_LENGTH + 1);
  const content = buildValidBlock('Long option test?', [
    ['A', longText],
    ['B', 'option b'],
    ['C', 'option c'],
    ['D', 'option d'],
  ]);

  const parsed = parseAiken(content);
  const aiken = validateAikenQuestions(parsed);
  const partitioned = partitionParsedAikenForImport(parsed, importContext);
  const preview = await previewAikenImport(content, importContext, { previewMode: false });

  assert(aiken.validQuestions.length === 1, 'aiken validator accepts (no per-option length cap)');
  assert(partitioned.validQuestions.length === 0, 'partition rejects long option');
  assert(preview.imported === 0, 'preview imported count is 0');
  assert(preview.failed === 1, 'preview failed count is 1');
  assert(
    partitioned.errors.some(
      (e) =>
        e.errorCode === 'INVALID_OPTION_LENGTH' &&
        e.validationLayer === 'schema' &&
        e.questionTitle &&
        e.message.includes('Option A')
    ),
    'partition reports structured schema option length failure'
  );
});

await runCase('structured diagnostics include required fields', async () => {
  const content = buildValidBlock('Duplicate options?', [
    ['A', 'Same'],
    ['B', 'Same'],
    ['C', 'Different'],
    ['D', 'Another'],
  ]);
  const preview = await previewAikenImport(content, importContext, { previewMode: false });
  const error = preview.errors[0];

  assert(Boolean(error?.questionNumber), 'has questionNumber');
  assert(Boolean(error?.questionTitle), 'has questionTitle');
  assert(error?.errorCode === 'DUPLICATE_OPTION_TEXT', 'has errorCode');
  assert(Boolean(error?.message), 'has message');
  assert(error?.validationLayer === 'aiken_validation', 'has validationLayer');
  assert(error?.reason === error?.errorCode, 'reason mirrors errorCode for compatibility');
});

await runCase('duplicate option text fails preview and partition identically', async () => {
  const content = buildValidBlock('Duplicate options?', [
    ['A', 'Same'],
    ['B', 'Same'],
    ['C', 'Different'],
    ['D', 'Another'],
  ]);

  const parsed = parseAiken(content);
  const aiken = validateAikenQuestions(parsed);
  const partitioned = partitionParsedAikenForImport(parsed, importContext);
  const preview = await previewAikenImport(content, importContext, { previewMode: false });

  assert(aiken.invalidQuestions.length === 1, 'aiken validator rejects duplicate text');
  assert(partitioned.validQuestions.length === 0, 'partition has no valid questions');
  assert(preview.imported === 0, 'preview imported count is 0');
  assert(partitioned.errors.length === preview.failed, 'partition and preview error counts match');
});

await runCase('preview and partition valid counts always match', async () => {
  const blocks = [
    buildValidBlock('Q1?'),
    buildValidBlock('Long option test?', [
      ['A', 'x'.repeat(MAX_OPTION_TEXT_LENGTH + 5)],
      ['B', 'b'],
      ['C', 'c'],
      ['D', 'd'],
    ]),
    buildValidBlock('Q3?'),
  ];
  const content = blocks.join('\n');
  const parsed = parseAiken(content);
  const partitioned = partitionParsedAikenForImport(parsed, importContext);
  const preview = await previewAikenImport(content, importContext, { previewMode: false });

  assert(
    partitioned.validQuestions.length === preview.imported,
    'partition valid count matches preview imported'
  );
  assert(
    partitioned.errors.length === preview.failed,
    'partition error count matches preview failed'
  );
  assert(preview.imported === 2, 'two questions survive full pipeline');
});

await runCase('preview without course_id skips bank duplicate check', async () => {
  const content = buildValidBlock('Quiz builder preview question?');
  const preview = await previewAikenImport(content, {}, { previewMode: true });

  assert(preview.imported === 1, 'question returned without explicit course_id');
  assert(preview.questions.length === 1, 'questions array populated');
  assert(preview.diagnostics.totalQuestions === 1, 'diagnostics totalQuestions set');
  assert(preview.diagnostics.validQuestions === 1, 'diagnostics validQuestions set');
});

await runCase('preview diagnostics expose full counts', async () => {
  const content = `${buildValidBlock('Q1?')}
Broken?
A) one
B) two
C) three
D) four

ANSWER: Z

${buildValidBlock('Q3?')}`;
  const preview = await previewAikenImport(content, importContext, { previewMode: false });

  assert(preview.diagnostics.totalQuestions === 3, 'totalQuestions is block count');
  assert(preview.diagnostics.parsedQuestions === 2, 'parsedQuestions counts successes');
  assert(preview.diagnostics.validQuestions === 2, 'validQuestions counts ready items');
  assert(preview.diagnostics.failedQuestions === 1, 'failedQuestions counts parse/validation errors');
  assert(preview.errors[0]?.lineNumber > 0, 'parse error includes lineNumber');
});

await runCase('partitionAikenDocumentForImport preserves block question numbers', async () => {
  const content = `${buildValidBlock('Q1?')}
Broken?
A) one
B) two
C) three
D) four

ANSWER: Z

${buildValidBlock('Q3?')}`;
  const document = parseAikenDocument(content);
  const partitioned = partitionAikenDocumentForImport(document, importContext);

  assert(partitioned.readyItems[0].questionNumber === 1, 'first ready item is question 1');
  assert(partitioned.readyItems[1].questionNumber === 3, 'second ready item is question 3');
  assert(partitioned.errors[0].questionNumber === 2, 'failed item is question 2');
});

}

runAll().then(() => {
console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed > 0 ? 1 : 0;
});
