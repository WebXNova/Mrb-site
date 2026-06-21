/**
 * idempotency_keys cleanup — seed expired keys + verify removal tests.
 *
 * Run: npm run test:idempotency-cleanup
 */
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getIdempotencyCleanupConfig } from '../config/idempotencyCleanup.config.js';
import {
  countExpiredIdempotencyKeys,
  deleteExpiredIdempotencyKeyBatch,
  runIdempotencyCleanup,
} from './idempotencyCleanup.service.js';
import {
  getIdempotencyCleanupMetricsSnapshot,
  resetIdempotencyCleanupMetricsForTests,
} from '../observability/idempotencyCleanupMetrics.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.join(__dirname, '..', '..');

let passed = 0;
let failed = 0;

function ok(label, condition) {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${label}`);
  }
}

function eq(label, actual, expected) {
  ok(label, actual === expected);
}

function mustContain(fileRel, needles, label) {
  const filePath = path.join(serverRoot, fileRel);
  ok(`exists: ${fileRel}`, existsSync(filePath));
  const text = readFileSync(filePath, 'utf8');
  for (const needle of needles) {
    ok(`${label}: "${needle}"`, text.includes(needle));
  }
}

const NOW = new Date('2026-06-18T12:00:00.000Z');

function hoursFromNow(hours) {
  return new Date(NOW.getTime() + hours * 60 * 60 * 1000);
}

/**
 * In-memory idempotency_keys store for deterministic cleanup tests.
 */
function createIdempotencyTestStore(seedRows = []) {
  /** @type {Array<{ id: number, idempotency_key: string, expires_at: Date }>} */
  const rows = seedRows.map((row, index) => ({
    id: row.id ?? index + 1,
    idempotency_key: row.idempotency_key ?? `key-${index + 1}`,
    expires_at: row.expires_at instanceof Date ? row.expires_at : new Date(row.expires_at),
  }));
  let nextId = rows.reduce((max, row) => Math.max(max, row.id), 0) + 1;

  const pool = {
    async query(sql, params = []) {
      const normalized = String(sql).replace(/\s+/g, ' ').trim();

      if (/^SELECT COUNT\(\*\) AS expired_count/i.test(normalized)) {
        const count = rows.filter((row) => row.expires_at < NOW).length;
        return [[{ expired_count: count }], []];
      }

      if (/^DELETE FROM idempotency_keys/i.test(normalized)) {
        const limit = Number(params[0]);
        const expired = rows
          .filter((row) => row.expires_at < NOW)
          .sort((a, b) => a.id - b.id)
          .slice(0, limit);
        const expiredIds = new Set(expired.map((row) => row.id));
        const before = rows.length;
        const kept = rows.filter((row) => !expiredIds.has(row.id));
        rows.length = 0;
        rows.push(...kept);
        return [{ affectedRows: before - rows.length }, []];
      }

      throw new Error(`unexpected sql in test store: ${normalized.slice(0, 120)}`);
    },
    seed(row) {
      const record = {
        id: row.id ?? nextId++,
        idempotency_key: row.idempotency_key ?? `key-${nextId}`,
        expires_at: row.expires_at instanceof Date ? row.expires_at : new Date(row.expires_at),
      };
      rows.push(record);
      return record;
    },
    all() {
      return [...rows];
    },
  };

  return pool;
}

console.log('idempotencyCleanup — retention policy tests\n');

const config = getIdempotencyCleanupConfig();
ok('batch size is positive', config.batchSize >= 100);
ok('schedule flag is boolean', typeof config.scheduleEnabled === 'boolean');
ok('default interval is 6 hours', config.intervalMinutes === 360);

console.log('\nSeed expired keys — batch delete removes only expired');
{
  const pool = createIdempotencyTestStore([
    { id: 1, idempotency_key: 'expired-1', expires_at: hoursFromNow(-48) },
    { id: 2, idempotency_key: 'expired-2', expires_at: hoursFromNow(-2) },
    { id: 3, idempotency_key: 'valid-1', expires_at: hoursFromNow(12) },
    { id: 4, idempotency_key: 'valid-2', expires_at: hoursFromNow(24) },
  ]);

  eq('2 expired keys before cleanup', await countExpiredIdempotencyKeys(pool), 2);
  const firstBatch = await deleteExpiredIdempotencyKeyBatch(pool, { batchSize: 1 });
  eq('first batch deletes 1 expired key', firstBatch, 1);
  eq('1 expired key remains', await countExpiredIdempotencyKeys(pool), 1);
  eq('3 total rows remain', pool.all().length, 3);

  const secondBatch = await deleteExpiredIdempotencyKeyBatch(pool, { batchSize: 10 });
  eq('second batch deletes remaining expired key', secondBatch, 1);
  eq('no expired keys remain', await countExpiredIdempotencyKeys(pool), 0);
  eq('valid keys preserved', pool.all().length, 2);
  ok('valid keys still in future', pool.all().every((row) => row.expires_at > NOW));
}

console.log('\nFull cleanup run — seed + verify removal');
{
  resetIdempotencyCleanupMetricsForTests();
  const pool = createIdempotencyTestStore();
  for (let i = 0; i < 35; i += 1) {
    pool.seed({
      idempotency_key: `old-${i}`,
      expires_at: hoursFromNow(-(i + 1)),
    });
  }
  for (let i = 0; i < 10; i += 1) {
    pool.seed({
      idempotency_key: `active-${i}`,
      expires_at: hoursFromNow(i + 1),
    });
  }

  const drySummary = await runIdempotencyCleanup({
    pool,
    batchSize: 10,
    batchPauseMs: 0,
    maxBatchesPerRun: 50,
    dryRun: true,
  });
  eq('dry-run reports 35 expired keys', drySummary.expiredBeforeRun, 35);
  eq('dry-run deletes nothing', drySummary.deleted, 0);
  eq('all 45 rows still present after dry-run', pool.all().length, 45);

  const summary = await runIdempotencyCleanup({
    pool,
    batchSize: 10,
    batchPauseMs: 0,
    maxBatchesPerRun: 50,
  });
  eq('cleanup deletes 35 expired keys', summary.deleted, 35);
  eq('10 valid keys remain', pool.all().length, 10);
  eq('no expired keys remain after run', summary.remainingExpired, 0);
  ok('cleanup used multiple batches', summary.batches >= 4);

  const metrics = getIdempotencyCleanupMetricsSnapshot();
  ok('metrics record deleted keys', metrics.deleted_total >= 35);
  ok('metrics record runs', metrics.runs_total >= 2);
}

console.log('\nTruncation — respects max batch cap per run');
{
  const pool = createIdempotencyTestStore();
  for (let i = 0; i < 15; i += 1) {
    pool.seed({ idempotency_key: `bulk-${i}`, expires_at: hoursFromNow(-10) });
  }
  const summary = await runIdempotencyCleanup({
    pool,
    batchSize: 5,
    batchPauseMs: 0,
    maxBatchesPerRun: 1,
  });
  eq('single batch deletes 5 keys', summary.deleted, 5);
  eq('10 expired keys remain when truncated', summary.remainingExpired, 10);
  ok('run marked truncated', summary.truncated === true);
}

mustContain(
  'src/services/idempotencyCleanup.service.js',
  [
    'expires_at < NOW()',
    'ORDER BY id ASC',
    'LIMIT ?',
    'StructuredLogger',
    'batchPauseMs',
  ],
  'batch cleanup service'
);

mustContain(
  'src/jobs/idempotencyCleanupScheduler.js',
  ['startIdempotencyCleanupScheduler', 'IDEMPOTENCY_CLEANUP_SCHEDULE_ENABLED'],
  'scheduler'
);

mustContain(
  'src/services/idempotency.service.js',
  ['runIdempotencyCleanup', 'cleanupExpiredIdempotencyKeys'],
  'legacy cleanup wrapper'
);

mustContain(
  'src/sql/schema.sql',
  ['idx_idempotency_expires (expires_at)'],
  'expires_at index'
);

mustContain(
  'src/server.js',
  ['startProductionCleanupSchedulers'],
  'server scheduler wiring'
);

mustContain(
  'src/controllers/metrics.controller.js',
  ['idempotencyCleanup', 'formatIdempotencyCleanupMetricsPrometheus'],
  'metrics endpoint wiring'
);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
