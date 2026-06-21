/**
 * question_import_batch_items structural tests (no DB required).
 * Run: node src/services/questionImportBatchItems.test.examples.mjs
 */
import { IMPORT_BATCH_ITEM_STATUS, diagnosticToFailedBatchItem } from './questionImportBatchItems.service.js';
import { buildAikenImportDiagnostic } from './aikenImportDiagnostics.js';

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

console.log('\n[IMPORT_BATCH_ITEM_STATUS]');
assert(IMPORT_BATCH_ITEM_STATUS.SUCCESS === 'SUCCESS', 'SUCCESS constant');
assert(IMPORT_BATCH_ITEM_STATUS.FAILED === 'FAILED', 'FAILED constant');

console.log('\n[diagnosticToFailedBatchItem]');
const diagnostic = buildAikenImportDiagnostic({
  questionNumber: 12,
  questionTitle: 'What is mitosis?',
  errorCode: 'INVALID_OPTION_LENGTH',
  message: 'Option B exceeds maximum length.',
  validationLayer: 'schema',
});
const item = diagnosticToFailedBatchItem(99, diagnostic);
assert(item.batchId === 99, 'batchId set');
assert(item.questionNumber === 12, 'questionNumber preserved');
assert(item.questionId === null, 'failed items have no questionId');
assert(item.status === IMPORT_BATCH_ITEM_STATUS.FAILED, 'status is FAILED');
assert(item.errorCode === 'INVALID_OPTION_LENGTH', 'errorCode preserved');
assert(item.validationLayer === 'schema', 'validationLayer preserved');

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed > 0 ? 1 : 0;
