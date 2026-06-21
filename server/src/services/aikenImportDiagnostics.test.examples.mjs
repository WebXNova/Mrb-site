/**
 * Aiken import diagnostics tests.
 * Run: node src/services/aikenImportDiagnostics.test.examples.mjs
 */
import { ApiError } from '../utils/apiError.js';
import {
  buildAikenImportDiagnostic,
  sanitizePersistenceImportFailure,
  truncateQuestionTitle,
} from './aikenImportDiagnostics.js';

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

console.log('\n[truncateQuestionTitle]');
assert(truncateQuestionTitle('  What is 2+2?  ') === 'What is 2+2?', 'trims whitespace');
assert(truncateQuestionTitle('') === '(untitled)', 'empty becomes untitled');
assert(truncateQuestionTitle('x'.repeat(100)).endsWith('…'), 'long titles truncate');

console.log('\n[buildAikenImportDiagnostic]');
const diagnostic = buildAikenImportDiagnostic({
  questionNumber: 12,
  lineNumber: 120,
  questionTitle: 'What is photosynthesis?',
  errorCode: 'INVALID_OPTION_LENGTH',
  message: 'Option B exceeds maximum length (1000 characters).',
  validationLayer: 'schema',
});
assert(diagnostic.questionNumber === 12, 'questionNumber preserved');
assert(diagnostic.lineNumber === 120, 'lineNumber preserved');
assert(diagnostic.questionTitle === 'What is photosynthesis?', 'questionTitle preserved');
assert(diagnostic.errorCode === 'INVALID_OPTION_LENGTH', 'errorCode preserved');
assert(diagnostic.validationLayer === 'schema', 'validationLayer preserved');
assert(diagnostic.reason === 'INVALID_OPTION_LENGTH', 'reason mirrors errorCode');

console.log('\n[sanitizePersistenceImportFailure]');
const sqlError = { code: 'ER_DUP_ENTRY', message: 'Duplicate entry for key PRIMARY' };
const safeSql = sanitizePersistenceImportFailure(sqlError);
assert(safeSql.code === 'IMPORT_PERSIST_FAILED', 'mysql errors map to safe code');
assert(!safeSql.message.includes('ER_DUP_ENTRY'), 'mysql errno not exposed');
assert(!safeSql.message.includes('PRIMARY'), 'sql internals not exposed');

const apiError = new ApiError(404, 'Course not found', { code: 'COURSE_NOT_FOUND' });
const safeApi = sanitizePersistenceImportFailure(apiError);
assert(safeApi.code === 'COURSE_NOT_FOUND', 'operational ApiError code preserved');
assert(safeApi.message === 'Course not found', 'operational ApiError message preserved');

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed > 0 ? 1 : 0;
