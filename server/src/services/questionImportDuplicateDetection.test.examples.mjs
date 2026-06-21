/**
 * Duplicate detection unit tests (no database).
 * Run: node src/services/questionImportDuplicateDetection.test.examples.mjs
 */
import {
  buildMcqImportFingerprint,
  buildMcqStemFingerprint,
  normalizeImportComparableText,
} from './questionImportFingerprint.service.js';
import {
  CourseQuestionDuplicateIndex,
  ImportBatchDuplicateTracker,
  IMPORT_DUPLICATE_POLICIES,
  detectImportDuplicate,
  summarizeReadyItemDuplicates,
} from './questionImportDuplicateDetection.service.js';

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

function buildReadyItem(stem, options, correct, questionNumber) {
  const optionRows = options.map(([key, text]) => ({
    option_key: key,
    option_text: text,
    is_correct: key === correct,
  }));
  return {
    questionNumber,
    aikenQuestion: { question_text: stem, correctAnswer: correct },
    writePayload: { question_text: stem, options: optionRows },
  };
}

console.log('\n[normalizeImportComparableText]');
assert(
  normalizeImportComparableText('  What is 2+2?  ') === normalizeImportComparableText('<p>What is 2+2?</p>'),
  'HTML and plain text normalize the same'
);

console.log('\n[exact fingerprint]');
const fp1 = buildMcqImportFingerprint({
  questionText: 'What is 2+2?',
  options: [
    { option_key: 'A', option_text: '4' },
    { option_key: 'B', option_text: '5' },
    { option_key: 'C', option_text: '6' },
    { option_key: 'D', option_text: '7' },
  ],
  correctAnswerKey: 'A',
});
const fp2 = buildMcqImportFingerprint({
  questionText: '<p>What is 2+2?</p>',
  options: [
    { option_key: 'A', option_text: '4' },
    { option_key: 'B', option_text: '5' },
    { option_key: 'C', option_text: '6' },
    { option_key: 'D', option_text: '7' },
  ],
  correctAnswerKey: 'A',
});
assert(fp1 === fp2, 'identical content produces identical fingerprint');

console.log('\n[detectImportDuplicate bank exact]');
const courseIndex = new CourseQuestionDuplicateIndex();
const batchTracker = new ImportBatchDuplicateTracker();
const incoming = buildReadyItem('Stem?', [['A', 'one'], ['B', 'two'], ['C', 'three'], ['D', 'four']], 'B', 1);
const { exactFingerprint, stemFingerprint } = {
  exactFingerprint: buildMcqImportFingerprint({
    questionText: incoming.writePayload.question_text,
    options: incoming.writePayload.options,
    correctAnswerKey: 'B',
  }),
  stemFingerprint: buildMcqStemFingerprint({
    questionText: incoming.writePayload.question_text,
    options: incoming.writePayload.options,
    correctAnswerKey: 'B',
  }),
};
courseIndex.add(42, exactFingerprint, stemFingerprint);
const bankDup = detectImportDuplicate({
  policy: IMPORT_DUPLICATE_POLICIES.SKIP,
  exactFingerprint,
  stemFingerprint,
  courseIndex,
  batchTracker,
});
assert(bankDup?.errorCode === 'DUPLICATE_EXACT_BANK', 'detects bank exact duplicate');
assert(bankDup?.existingQuestionId === 42, 'returns existing question id');

console.log('\n[summarizeReadyItemDuplicates in-file]');
const items = [
  buildReadyItem('Q1?', [['A', 'a'], ['B', 'b'], ['C', 'c'], ['D', 'd']], 'A', 1),
  buildReadyItem('Q1?', [['A', 'a'], ['B', 'b'], ['C', 'c'], ['D', 'd']], 'A', 2),
];
const summary = summarizeReadyItemDuplicates({
  readyItems: items,
  courseIndex: new CourseQuestionDuplicateIndex(),
  policy: IMPORT_DUPLICATE_POLICIES.SKIP,
});
assert(summary.skippedDuplicates === 1, 'skips one in-file exact duplicate');
assert(summary.skipped[0]?.questionNumber === 2, 'flags second occurrence');

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed > 0 ? 1 : 0;
