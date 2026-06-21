/**
 * Enrollment one-active-per-user schema migration tests.
 * Run: npm run test:enrollment-one-active-per-user-schema
 */
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  analyzeEnrollmentOneActivePerUser,
  ensureEnrollmentOneActivePerUserSchema,
} from './ensureEnrollmentOneActivePerUserSchema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

function mustContain(fileRel, needles) {
  const text = readFileSync(path.join(__dirname, '..', '..', fileRel), 'utf8');
  for (const needle of needles) {
    assert(`${fileRel} contains "${needle}"`, text.includes(needle));
  }
}

console.log('ensureEnrollmentOneActivePerUserSchema tests\n');

console.log('[source wiring]');
mustContain('src/db/ensureEnrollmentOneActivePerUserSchema.js', [
  'enrollment_one_active_per_user',
  "access_status = 'active'",
  'active_user_id',
  'uq_enrollments_one_active_per_user',
  'ROW_NUMBER() OVER',
]);
mustContain('src/sql/schema.sql', [
  'active_user_id BIGINT GENERATED ALWAYS AS (IF(access_status =',
  'uq_enrollments_one_active_per_user (active_user_id)',
]);
mustContain('src/db/runRequiredStartupMigrations.js', [
  'enrollment_one_active_per_user',
  'ensureEnrollmentOneActivePerUserSchema',
]);

console.log('\n[dry-run migration plan]');
const plan = await ensureEnrollmentOneActivePerUserSchema(
  {
    query: async (sql) => {
      const q = String(sql);
      if (q.includes('SELECT DATABASE()')) return [[{ db: 'mrb_learning' }]];
      if (q.includes('INFORMATION_SCHEMA.TABLES')) return [[{ n: 1 }]];
      if (q.includes('INFORMATION_SCHEMA.COLUMNS') && q.includes('active_user_id')) return [[{ n: 0 }]];
      if (q.includes('INFORMATION_SCHEMA.STATISTICS') && q.includes('uq_enrollments_one_active_per_user')) {
        return [[{ n: 0 }]];
      }
      return [[{ n: 0 }]];
    },
  },
  { dryRun: true }
);
assert(plan.migration === 'enrollment_one_active_per_user', 'migration name set');
assert(Array.isArray(plan.steps) && plan.steps.length >= 3, 'plans dedupe + column + index steps');
assert(
  plan.steps.some((s) => s.name === 'deactivate_duplicate_active_enrollments_per_user'),
  'includes dedupe step'
);
assert(plan.steps.some((s) => s.name === 'add_active_user_id_generated'), 'includes generated column step');
assert(
  plan.steps.some((s) => s.name === 'add_uq_enrollments_one_active_per_user'),
  'includes unique index step'
);

console.log('\n[analyze helper]');
const analysis = await analyzeEnrollmentOneActivePerUser({
  query: async (sql) => {
    if (String(sql).includes('HAVING COUNT(*) > 1')) return [[], []];
    if (String(sql).includes("INDEX_NAME = 'uq_enrollments_one_active_per_user'")) {
      return [[{ indexPresent: 1 }], []];
    }
    if (String(sql).includes("COLUMN_NAME = 'active_user_id'")) {
      return [[{ columnPresent: 1 }], []];
    }
    return [[], []];
  },
});
assert(analysis.migrationReady === true, 'analyze reports ready when no violations');
assert(analysis.uniqueIndexPresent === true, 'analyze detects unique index');

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed > 0 ? 1 : 0;
