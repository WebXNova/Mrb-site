/**
 * Batch lifecycle transition tests for course publish flows.
 * Run: node src/services/courseBatchStateTransition.test.examples.mjs
 */
import {
  normalizeBatchStatusForPublish,
  validateBatchStateTransition,
} from './courseBatch.service.js';

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

function expectTransition(from, to, shouldPass) {
  try {
    validateBatchStateTransition(from, to);
    assert(shouldPass, `${from} -> ${to} allowed`);
  } catch (error) {
    assert(!shouldPass, `${from} -> ${to} rejected (${error.message})`);
  }
}

console.log('courseBatchStateTransition tests\n');

console.log('[normalizeBatchStatusForPublish]');
assert(normalizeBatchStatusForPublish('draft') === 'upcoming', 'draft -> upcoming');
assert(normalizeBatchStatusForPublish('published') === 'published', 'published preserved');
assert(normalizeBatchStatusForPublish('running') === 'upcoming', 'running -> upcoming');
assert(normalizeBatchStatusForPublish('completed') === 'upcoming', 'completed -> upcoming');

console.log('\n[publish transitions]');
expectTransition('draft', 'upcoming', true);
expectTransition('draft', 'published', true);
expectTransition('upcoming', 'published', true);
expectTransition('published', 'upcoming', true);

console.log('\n[invalid transitions remain blocked]');
expectTransition('upcoming', 'draft', false);
expectTransition('published', 'draft', false);
expectTransition('draft', 'running', false);

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed > 0 ? 1 : 0;
