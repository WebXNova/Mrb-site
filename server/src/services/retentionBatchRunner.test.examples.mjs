/**
 * retentionBatchRunner tests.
 * Run: npm run test:retention-batch-runner
 */
import { runBatchedRetentionDeletes } from './retentionBatchRunner.js';

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

console.log('retentionBatchRunner tests\n');

console.log('[batched deletes]');
let calls = 0;
const full = await runBatchedRetentionDeletes({
  deleteBatch: async (limit) => {
    calls += 1;
    return limit;
  },
  batchSize: 10,
  batchPauseMs: 0,
  maxBatchesPerRun: 3,
  maxRetriesPerBatch: 1,
});
assert(full.batches === 3, 'runs up to max batches when always full');
assert(full.deleted === 30, 'accumulates deleted rows');
assert(full.truncated === true, 'marks truncated when batch cap reached');

calls = 0;
const partial = await runBatchedRetentionDeletes({
  deleteBatch: async () => {
    calls += 1;
    return calls === 1 ? 5 : 0;
  },
  batchSize: 10,
  batchPauseMs: 0,
  maxBatchesPerRun: 5,
  maxRetriesPerBatch: 1,
});
assert(partial.batches === 1, 'stops after partial batch');
assert(partial.deleted === 5, 'records partial delete count');
assert(partial.truncated === false, 'not truncated when work completes early');

console.log('\n[retries]');
let attempts = 0;
const retried = await runBatchedRetentionDeletes({
  deleteBatch: async () => {
    attempts += 1;
    if (attempts < 3) throw new Error('transient lock wait');
    return 2;
  },
  batchSize: 10,
  batchPauseMs: 0,
  maxBatchesPerRun: 1,
  maxRetriesPerBatch: 3,
  retryBasePauseMs: 0,
});
assert(retried.deleted === 2, 'succeeds after transient failures');
assert(retried.retriedBatches === 1, 'records retried batch');

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed > 0 ? 1 : 0;
