/**
 * activity_logs retention — seed + cleanup verification tests.
 *
 * Run: npm run test:activity-log-retention
 */
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getActivityLogRetentionConfig } from '../config/activityLogRetention.config.js';
import {
  computeActivityLogRetentionCutoff,
  countExpiredActivityLogs,
  deleteExpiredActivityLogBatch,
  runActivityLogRetention,
} from './activityLogRetention.service.js';
import {
  getActivityLogRetentionMetricsSnapshot,
  resetActivityLogRetentionMetricsForTests,
} from '../observability/activityLogRetentionMetrics.service.js';

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

const NOW_MS = Date.UTC(2026, 5, 18, 12, 0, 0);
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * In-memory activity_logs store for deterministic retention tests.
 */
function createActivityLogTestStore(seedRows = []) {
  /** @type {Array<{ id: number, created_at: Date, action: string }>} */
  const rows = seedRows.map((row, index) => ({
    id: row.id ?? index + 1,
    created_at: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
    action: row.action ?? 'test.seed',
  }));
  let nextId = rows.reduce((max, row) => Math.max(max, row.id), 0) + 1;

  const pool = {
    async query(sql, params = []) {
      const normalized = String(sql).replace(/\s+/g, ' ').trim();

      if (/^SELECT COUNT\(\*\) AS expired_count/i.test(normalized)) {
        const cutoff = params[0];
        const count = rows.filter((row) => row.created_at < cutoff).length;
        return [[{ expired_count: count }], []];
      }

      if (/^DELETE FROM activity_logs/i.test(normalized)) {
        const cutoff = params[0];
        const limit = Number(params[1]);
        const expired = rows
          .filter((row) => row.created_at < cutoff)
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
        created_at: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
        action: row.action ?? 'test.seed',
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

console.log('activityLogRetention — retention policy tests\n');

const config = getActivityLogRetentionConfig();
ok('default retention is 90 days', config.retentionDays === 90);
ok('batch size is positive', config.batchSize >= 100);
ok('schedule flag is boolean', typeof config.scheduleEnabled === 'boolean');

console.log('\nCutoff computation');
{
  const cutoff = computeActivityLogRetentionCutoff(90, NOW_MS);
  const expected = new Date(NOW_MS - 90 * MS_PER_DAY);
  ok('cutoff is 90 days before now', cutoff.getTime() === expected.getTime());
}

console.log('\nSeed old logs — verify batch cleanup');
{
  const pool = createActivityLogTestStore([
    { id: 1, created_at: new Date(NOW_MS - 120 * MS_PER_DAY), action: 'old.a' },
    { id: 2, created_at: new Date(NOW_MS - 100 * MS_PER_DAY), action: 'old.b' },
    { id: 3, created_at: new Date(NOW_MS - 95 * MS_PER_DAY), action: 'old.c' },
    { id: 4, created_at: new Date(NOW_MS - 10 * MS_PER_DAY), action: 'recent.a' },
    { id: 5, created_at: new Date(NOW_MS - 1 * MS_PER_DAY), action: 'recent.b' },
  ]);
  const cutoff = computeActivityLogRetentionCutoff(90, NOW_MS);

  eq('3 rows expired before cleanup', await countExpiredActivityLogs(pool, cutoff), 3);

  const firstBatch = await deleteExpiredActivityLogBatch(pool, { cutoff, batchSize: 2 });
  eq('first batch deletes 2 rows', firstBatch, 2);
  eq('1 expired row remains after first batch', await countExpiredActivityLogs(pool, cutoff), 1);

  const secondBatch = await deleteExpiredActivityLogBatch(pool, { cutoff, batchSize: 2 });
  eq('second batch deletes remaining expired row', secondBatch, 1);
  eq('no expired rows remain', await countExpiredActivityLogs(pool, cutoff), 0);
  eq('recent rows preserved', pool.all().length, 2);
  ok('recent rows kept', pool.all().every((row) => row.created_at >= cutoff));
}

console.log('\nFull retention run — seed + verify cleanup');
{
  resetActivityLogRetentionMetricsForTests();
  const pool = createActivityLogTestStore();
  for (let i = 0; i < 25; i += 1) {
    pool.seed({
      created_at: new Date(NOW_MS - (100 + i) * MS_PER_DAY),
      action: `old.${i}`,
    });
  }
  for (let i = 0; i < 8; i += 1) {
    pool.seed({
      created_at: new Date(NOW_MS - (5 + i) * MS_PER_DAY),
      action: `recent.${i}`,
    });
  }

  const drySummary = await runActivityLogRetention({
    pool,
    nowMs: NOW_MS,
    retentionDays: 90,
    batchSize: 10,
    batchPauseMs: 0,
    maxBatchesPerRun: 50,
    dryRun: true,
  });
  eq('dry-run reports 25 expired rows', drySummary.expiredBeforeRun, 25);
  eq('dry-run deletes nothing', drySummary.deleted, 0);
  eq('all 33 rows still present after dry-run', pool.all().length, 33);

  const summary = await runActivityLogRetention({
    pool,
    nowMs: NOW_MS,
    retentionDays: 90,
    batchSize: 10,
    batchPauseMs: 0,
    maxBatchesPerRun: 50,
  });
  eq('cleanup deletes 25 old rows', summary.deleted, 25);
  eq('8 recent rows remain', pool.all().length, 8);
  eq('no expired rows remain after run', summary.remainingExpired, 0);
  ok('batches used for cleanup', summary.batches >= 3);

  const metrics = getActivityLogRetentionMetricsSnapshot();
  ok('metrics record deleted rows', metrics.deleted_total >= 25);
  ok('metrics record runs', metrics.runs_total >= 2);
}

console.log('\nTruncation — respects max batch cap per run');
{
  const pool = createActivityLogTestStore();
  for (let i = 0; i < 15; i += 1) {
    pool.seed({ created_at: new Date(NOW_MS - 120 * MS_PER_DAY), action: `bulk.${i}` });
  }
  const summary = await runActivityLogRetention({
    pool,
    nowMs: NOW_MS,
    retentionDays: 90,
    batchSize: 5,
    batchPauseMs: 0,
    maxBatchesPerRun: 1,
  });
  eq('single batch deletes 5 rows', summary.deleted, 5);
  eq('10 expired rows remain when truncated', summary.remainingExpired, 10);
  ok('run marked truncated', summary.truncated === true);
}

console.log('\nWiring checks');
mustContain(
  'src/services/activityLogRetention.service.js',
  [
    'DELETE FROM activity_logs',
    'ORDER BY id ASC',
    'LIMIT ?',
    'created_at < ?',
    'batchPauseMs',
  ],
  'batch delete SQL'
);

mustContain(
  'src/jobs/activityLogRetentionScheduler.js',
  ['startActivityLogRetentionScheduler', 'ACTIVITY_LOG_RETENTION_SCHEDULE_ENABLED'],
  'scheduler'
);

mustContain(
  'src/observability/activityLogRetentionMetrics.service.js',
  ['activity_log_retention_deleted_total', 'formatActivityLogRetentionMetricsPrometheus'],
  'metrics'
);

mustContain(
  'src/config/activityLogRetention.config.js',
  ['ACTIVITY_LOG_RETENTION_DAYS', 'retentionDays', '90'],
  'retention config'
);

mustContain(
  'src/server.js',
  ['startProductionCleanupSchedulers'],
  'server scheduler wiring'
);

mustContain(
  'src/controllers/metrics.controller.js',
  ['activityLogRetention', 'formatActivityLogRetentionMetricsPrometheus'],
  'metrics endpoint wiring'
);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
