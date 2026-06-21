/**
 * Enrollment switch_confirmed_at schema migration tests.
 * Run: npm run test:enrollment-switch-confirmed-schema
 */
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  ADD_SWITCH_CONFIRMED_COLUMN_SQL,
  analyzeEnrollmentSwitchConfirmedSchema,
  ensureEnrollmentSwitchConfirmedSchema,
} from './ensureEnrollmentSwitchConfirmedSchema.js';

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

function mockPool(handlers) {
  return {
    query: async (sql, params = []) => {
      const q = String(sql);
      for (const handler of handlers) {
        const result = handler(q, params);
        if (result !== undefined) return result;
      }
      throw new Error(`Unexpected query: ${q}`);
    },
  };
}

console.log('ensureEnrollmentSwitchConfirmedSchema tests\n');

console.log('[DDL contract]');
assert(ADD_SWITCH_CONFIRMED_COLUMN_SQL.includes('ALGORITHM=INSTANT'), 'uses ALGORITHM=INSTANT');
assert(ADD_SWITCH_CONFIRMED_COLUMN_SQL.includes('LOCK=NONE'), 'uses LOCK=NONE');
assert(!ADD_SWITCH_CONFIRMED_COLUMN_SQL.includes('AFTER '), 'does not use AFTER (allows instant DDL)');
assert(ADD_SWITCH_CONFIRMED_COLUMN_SQL.includes('switch_confirmed_at'), 'targets switch_confirmed_at');

console.log('\n[startup wiring]');
mustContain('src/server.js', 'ensureEnrollmentSwitchConfirmedSchema(mysqlPool)');

console.log('\n[idempotent no-op when column exists]');
const noop = await ensureEnrollmentSwitchConfirmedSchema(
  mockPool([
    (q) => (q.includes('SELECT DATABASE()') ? [[{ db: 'mrb_learning' }]] : undefined),
    (q) => (q.includes('INFORMATION_SCHEMA.TABLES') ? [[{ ok: 1 }]] : undefined),
    (q) => (q.includes('INFORMATION_SCHEMA.COLUMNS') ? [[{ ok: 1 }]] : undefined),
  ])
);
assert(noop.steps.length === 0, 'returns empty steps when column already present');

console.log('\n[plans DDL when column missing]');
const plan = await ensureEnrollmentSwitchConfirmedSchema(
  mockPool([
    (q) => (q.includes('SELECT DATABASE()') ? [[{ db: 'mrb_learning' }]] : undefined),
    (q) => (q.includes('INFORMATION_SCHEMA.TABLES') ? [[{ ok: 1 }]] : undefined),
    (q) => (q.includes('INFORMATION_SCHEMA.COLUMNS') ? [[]] : undefined),
  ]),
  { dryRun: true }
);
assert(plan.steps.length === 1, 'plans one step when column missing');
assert(plan.steps[0].sql === ADD_SWITCH_CONFIRMED_COLUMN_SQL, 'step uses canonical DDL');

console.log('\n[analyze helper]');
const ready = await analyzeEnrollmentSwitchConfirmedSchema(
  mockPool([
    (q) => (q.includes('SELECT DATABASE()') ? [[{ db: 'mrb_learning' }]] : undefined),
    (q) => (q.includes('INFORMATION_SCHEMA.TABLES') ? [[{ ok: 1 }]] : undefined),
    (q) => (q.includes('INFORMATION_SCHEMA.COLUMNS') ? [[{ ok: 1 }]] : undefined),
  ])
);
assert(ready.migrationReady === true, 'analyze reports ready when column present');

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed > 0 ? 1 : 0;
