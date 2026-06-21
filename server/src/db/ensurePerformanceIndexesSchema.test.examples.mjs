/**
 * Performance index migration tests.
 * Run: npm run test:performance-indexes
 */
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  analyzePerformanceIndexes,
  ensurePerformanceIndexesSchema,
  PERFORMANCE_INDEX_DEFINITIONS,
} from './ensurePerformanceIndexesSchema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.join(__dirname, '..', '..');

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

function mustContain(fileRel, needle) {
  const text = readFileSync(path.join(serverRoot, fileRel), 'utf8');
  assert(`${fileRel} contains "${needle}"`, text.includes(needle));
}

console.log('ensurePerformanceIndexesSchema tests\n');

console.log('[index registry]');
assert(PERFORMANCE_INDEX_DEFINITIONS.length === 3, 'defines three performance indexes');
assert(
  PERFORMANCE_INDEX_DEFINITIONS.some((d) => d.name === 'idx_test_attempts_test_student_status'),
  'includes test_id, student_id, status index'
);
assert(
  PERFORMANCE_INDEX_DEFINITIONS.some((d) => d.name === 'idx_test_attempts_user_status'),
  'includes user_id, status index'
);
assert(
  PERFORMANCE_INDEX_DEFINITIONS.some((d) => d.name === 'idx_activity_logs_user_created_at'),
  'includes activity_logs user_id, created_at index'
);

console.log('\n[schema.sql fresh install]');
mustContain('src/sql/schema.sql', 'idx_test_attempts_user_status (user_id, status)');
mustContain('src/sql/schema.sql', 'idx_activity_logs_user_created_at (user_id, created_at)');

console.log('\n[startup wiring]');
mustContain('src/server.js', 'ensurePerformanceIndexesSchema(mysqlPool)');

console.log('\n[idempotent apply — missing indexes only]');
const result = await ensurePerformanceIndexesSchema(
  {
    query: async (sql, params = []) => {
      const q = String(sql);
      if (q.includes('SELECT DATABASE()')) return [[{ db: 'mrb_learning' }]];
      if (q.includes('INFORMATION_SCHEMA.TABLES')) return [[{ n: 1 }]];
      if (q.includes('INFORMATION_SCHEMA.STATISTICS')) {
        const indexName = params[2];
        if (indexName === 'idx_test_attempts_test_student_status') return [[{ n: 1 }]];
        return [[{ n: 0 }]];
      }
      return [[{ n: 0 }]];
    },
  },
  { dryRun: true }
);
assert(result.steps.length === 2, 'plans only missing indexes');
assert(
  result.steps.every((s) => s.name !== 'add_idx_test_attempts_test_student_status'),
  'skips existing test_student_status index'
);

console.log('\n[analyze helper]');
const analysis = await analyzePerformanceIndexes({
  query: async (sql, params = []) => {
    const q = String(sql);
    if (q.includes('SELECT DATABASE()')) return [[{ db: 'mrb_learning' }]];
    if (q.includes('INFORMATION_SCHEMA.TABLES')) return [[{ n: 1 }]];
    if (q.includes('INFORMATION_SCHEMA.STATISTICS')) return [[{ n: 1 }]];
    return [[{ n: 0 }]];
  },
});
assert(analysis.allPresent === true, 'analyze reports all indexes present');

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed > 0 ? 1 : 0;
