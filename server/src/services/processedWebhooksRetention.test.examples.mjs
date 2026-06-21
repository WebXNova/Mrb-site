/**
 * processed_webhooks retention — seed old entries + verify cleanup tests.
 *
 * Run: npm run test:processed-webhooks-retention
 */
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getProcessedWebhooksRetentionConfig } from '../config/processedWebhooksRetention.config.js';
import {
  computeProcessedWebhooksRetentionCutoff,
  countExpiredProcessedWebhooks,
  deleteExpiredProcessedWebhooksBatch,
  runProcessedWebhooksRetention,
} from './processedWebhooksRetention.service.js';
import {
  getProcessedWebhooksRetentionMetricsSnapshot,
  resetProcessedWebhooksRetentionMetricsForTests,
} from '../observability/processedWebhooksRetentionMetrics.service.js';

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

function daysAgo(days) {
  return new Date(NOW_MS - days * MS_PER_DAY);
}

function createProcessedWebhooksTestStore(seedRows = []) {
  /** @type {Array<{ id: number, webhook_hash: string, created_at: Date }>} */
  const rows = seedRows.map((row, index) => ({
    id: row.id ?? index + 1,
    webhook_hash: row.webhook_hash ?? `hash-${index + 1}`,
    created_at: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
  }));
  let nextId = rows.reduce((max, row) => Math.max(max, row.id), 0) + 1;

  const pool = {
    async query(sql, params = []) {
      const normalized = String(sql).replace(/\s+/g, ' ').trim();
      const cutoff = params[0] instanceof Date ? params[0] : new Date(params[0]);

      if (/^SELECT COUNT\(\*\) AS expired_count/i.test(normalized)) {
        const count = rows.filter((row) => row.created_at < cutoff).length;
        return [[{ expired_count: count }], []];
      }

      if (/^DELETE FROM processed_webhooks/i.test(normalized)) {
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
        webhook_hash: row.webhook_hash ?? `hash-${nextId}`,
        created_at: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
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

console.log('processedWebhooksRetention — retention policy tests\n');

const config = getProcessedWebhooksRetentionConfig();
ok('default retention is 90 days', config.retentionDays === 90);
ok('batch size is positive', config.batchSize >= 100);
ok('schedule flag is boolean', typeof config.scheduleEnabled === 'boolean');

console.log('\nCutoff computation');
{
  const cutoff = computeProcessedWebhooksRetentionCutoff(90, NOW_MS);
  const expected = new Date(NOW_MS - 90 * MS_PER_DAY);
  ok('cutoff is 90 days before now', cutoff.getTime() === expected.getTime());
}

console.log('\nSeed old webhook entries — batch delete');
{
  const pool = createProcessedWebhooksTestStore([
    { id: 1, webhook_hash: 'old-a', created_at: daysAgo(120) },
    { id: 2, webhook_hash: 'old-b', created_at: daysAgo(95) },
    { id: 3, webhook_hash: 'recent-a', created_at: daysAgo(10) },
    { id: 4, webhook_hash: 'recent-b', created_at: daysAgo(1) },
  ]);
  const cutoff = computeProcessedWebhooksRetentionCutoff(90, NOW_MS);

  eq('2 expired rows before cleanup', await countExpiredProcessedWebhooks(pool, cutoff), 2);
  const firstBatch = await deleteExpiredProcessedWebhooksBatch(pool, { cutoff, batchSize: 1 });
  eq('first batch deletes 1 row', firstBatch, 1);
  eq('1 expired row remains', await countExpiredProcessedWebhooks(pool, cutoff), 1);
  eq('3 rows total remain', pool.all().length, 3);

  const secondBatch = await deleteExpiredProcessedWebhooksBatch(pool, { cutoff, batchSize: 10 });
  eq('second batch deletes remaining expired row', secondBatch, 1);
  eq('no expired rows remain', await countExpiredProcessedWebhooks(pool, cutoff), 0);
  eq('recent webhook hashes preserved', pool.all().length, 2);
}

console.log('\nFull retention run — seed + verify cleanup');
{
  resetProcessedWebhooksRetentionMetricsForTests();
  const pool = createProcessedWebhooksTestStore();
  for (let i = 0; i < 28; i += 1) {
    pool.seed({
      webhook_hash: `old-webhook-${i}`,
      created_at: daysAgo(100 + i),
    });
  }
  for (let i = 0; i < 7; i += 1) {
    pool.seed({
      webhook_hash: `recent-webhook-${i}`,
      created_at: daysAgo(5 + i),
    });
  }

  const drySummary = await runProcessedWebhooksRetention({
    pool,
    nowMs: NOW_MS,
    retentionDays: 90,
    batchSize: 10,
    batchPauseMs: 0,
    maxBatchesPerRun: 50,
    dryRun: true,
  });
  eq('dry-run reports 28 expired rows', drySummary.expiredBeforeRun, 28);
  eq('dry-run deletes nothing', drySummary.deleted, 0);
  eq('all 35 rows still present after dry-run', pool.all().length, 35);

  const summary = await runProcessedWebhooksRetention({
    pool,
    nowMs: NOW_MS,
    retentionDays: 90,
    batchSize: 10,
    batchPauseMs: 0,
    maxBatchesPerRun: 50,
  });
  eq('cleanup deletes 28 old webhook rows', summary.deleted, 28);
  eq('7 recent rows remain', pool.all().length, 7);
  eq('no expired rows remain after run', summary.remainingExpired, 0);
  ok('cleanup used multiple batches', summary.batches >= 3);

  const metrics = getProcessedWebhooksRetentionMetricsSnapshot();
  ok('metrics record deleted rows', metrics.deleted_total >= 28);
  ok('metrics record runs', metrics.runs_total >= 2);
}

console.log('\nTruncation — respects max batch cap per run');
{
  const pool = createProcessedWebhooksTestStore();
  for (let i = 0; i < 12; i += 1) {
    pool.seed({ webhook_hash: `bulk-${i}`, created_at: daysAgo(120) });
  }
  const summary = await runProcessedWebhooksRetention({
    pool,
    nowMs: NOW_MS,
    retentionDays: 90,
    batchSize: 5,
    batchPauseMs: 0,
    maxBatchesPerRun: 1,
  });
  eq('single batch deletes 5 rows', summary.deleted, 5);
  eq('7 expired rows remain when truncated', summary.remainingExpired, 7);
  ok('run marked truncated', summary.truncated === true);
}

mustContain(
  'src/services/processedWebhooksRetention.service.js',
  [
    'created_at < ?',
    'ORDER BY id ASC',
    'LIMIT ?',
    'StructuredLogger',
    'batchPauseMs',
  ],
  'retention service'
);

mustContain(
  'src/jobs/processedWebhooksRetentionScheduler.js',
  ['startProcessedWebhooksRetentionScheduler', 'PROCESSED_WEBHOOKS_RETENTION_SCHEDULE_ENABLED'],
  'scheduler'
);

mustContain(
  'src/sql/schema.sql',
  ['idx_processed_webhooks_created_at (created_at)'],
  'created_at index in schema'
);

mustContain(
  'src/db/ensureProcessedWebhooksSchema.js',
  ['ensureProcessedWebhooksRetentionIndex', 'idx_processed_webhooks_created_at'],
  'schema bootstrap index'
);

mustContain(
  'src/server.js',
  ['startProductionCleanupSchedulers', 'ensureProcessedWebhooksRetentionIndex'],
  'server wiring'
);

mustContain(
  'src/controllers/metrics.controller.js',
  ['processedWebhooksRetention', 'formatProcessedWebhooksRetentionMetricsPrometheus'],
  'metrics endpoint wiring'
);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
