/**
 * productionCleanupSchedulers — startup wiring tests.
 * Run: npm run test:production-cleanup-schedulers
 */
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  PRODUCTION_CLEANUP_SCHEDULERS,
  startProductionCleanupSchedulers,
} from '../jobs/productionCleanupSchedulers.js';

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

function mustContain(fileRel, needles, label) {
  const filePath = path.join(serverRoot, fileRel);
  ok(`exists: ${fileRel}`, existsSync(filePath));
  const text = readFileSync(filePath, 'utf8');
  for (const needle of needles) {
    ok(`${label}: "${needle}"`, text.includes(needle));
  }
}

console.log('productionCleanupSchedulers — startup reliability tests\n');

console.log('Scheduler registry');
{
  ok('registers data-retention scheduler', PRODUCTION_CLEANUP_SCHEDULERS.some((s) => s.id === 'data-retention'));
  ok('registers idempotency scheduler', PRODUCTION_CLEANUP_SCHEDULERS.some((s) => s.id === 'idempotency'));
  ok('data-retention wires unified retention job', PRODUCTION_CLEANUP_SCHEDULERS.some((s) =>
    s.id === 'data-retention' && String(s.start?.name || '').includes('DataRetention')
  ));
  ok('idempotency wires cleanup job', PRODUCTION_CLEANUP_SCHEDULERS.some((s) =>
    s.id === 'idempotency' && String(s.start?.name || '').includes('Idempotency')
  ));
}

console.log('\nBootstrap isolation — one scheduler failure does not throw');
{
  const calls = [];
  const fakeSchedulers = [
    {
      id: 'ok',
      label: 'ok scheduler',
      start() {
        calls.push('ok');
        return {};
      },
    },
    {
      id: 'boom',
      label: 'broken scheduler',
      start() {
        calls.push('boom');
        throw new Error('scheduler init failed');
      },
    },
    {
      id: 'disabled',
      label: 'disabled scheduler',
      start() {
        calls.push('disabled');
        return null;
      },
    },
  ];

  let threw = false;
  let result = null;
  try {
    result = startProductionCleanupSchedulers(fakeSchedulers);
  } catch {
    threw = true;
  }

  ok('bootstrap does not throw when a scheduler fails', !threw);
  ok('healthy scheduler still starts', calls.includes('ok'));
  ok('failed scheduler recorded', result?.failed?.includes('boom'));
  ok('disabled scheduler recorded', result?.disabled?.includes('disabled'));
  ok('started scheduler recorded', result?.started?.includes('ok'));
}

mustContain(
  'src/server.js',
  ['startProductionCleanupSchedulers', 'onListening'],
  'server startup wiring'
);

mustContain(
  'src/jobs/productionCleanupSchedulers.js',
  [
    'startDataRetentionCleanupScheduler',
    'startIdempotencyCleanupScheduler',
    'failed to start',
    'bootstrap complete',
  ],
  'production cleanup coordinator'
);

mustContain(
  'src/jobs/dataRetentionCleanupScheduler.js',
  ['scheduled run failed', 'initial run failed', 'activity_logs cleanup failed'],
  'data retention scheduler failure isolation'
);

mustContain(
  'src/jobs/idempotencyCleanupScheduler.js',
  ['scheduled run failed', 'initial run failed', 'run failed'],
  'idempotency scheduler failure isolation'
);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
