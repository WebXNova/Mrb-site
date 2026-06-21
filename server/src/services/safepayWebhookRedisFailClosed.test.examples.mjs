/**
 * H-05 — Redis fail-closed protection for Safepay webhooks.
 *
 * Run: node src/services/safepayWebhookRedisFailClosed.test.examples.mjs
 */
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  getSafepayWebhookReplayMetrics,
  logSafepayWebhookRedisRecovery,
  logSafepayWebhookRedisUnavailable,
  resetSafepayWebhookReplayMetricsForTests,
} from './safepayWebhookReplayMetrics.service.js';

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

/** Mirrors H-05 fail-closed controller gate (no fulfillment without Redis SET NX). */
class MockRedisFailClosed {
  constructor({ offline = false, throwOnSet = null } = {}) {
    this.offline = offline;
    this.throwOnSet = throwOnSet;
    this.store = new Map();
  }

  async set(key, value, { EX, NX } = {}) {
    if (this.offline) return null;
    if (this.throwOnSet) {
      const err = new Error(this.throwOnSet);
      err.code = this.throwOnSet;
      throw err;
    }
    if (NX && this.store.has(key)) return null;
    this.store.set(key, { value, expiresAt: Date.now() + (EX ?? 60) * 1000 });
    return 'OK';
  }
}

class MockLedger {
  constructor() {
    this.hashes = new Set();
  }

  isProcessed(hash) {
    return this.hashes.has(hash);
  }

  tryClaim(hash) {
    if (this.hashes.has(hash)) return 'duplicate';
    this.hashes.add(hash);
    return 'claimed';
  }
}

async function runFailClosedWebhookGate({ redis, ledger, digest, fulfillCount }) {
  if (ledger.isProcessed(digest)) {
    return { status: 200, replay: true, fulfilled: false };
  }

  if (!redis || redis.offline) {
    logSafepayWebhookRedisUnavailable({ reason: 'SAFEPAY_WEBHOOK_REDIS_REQUIRED', requestId: 'test' });
    return { status: 503, replay: false, fulfilled: false, code: 'SAFEPAY_WEBHOOK_REDIS_REQUIRED' };
  }

  try {
    const claim = await redis.set(`payments:sfpy:wh:replay:v2:${digest}`, 'processing', {
      EX: 120,
      NX: true,
    });
    if (claim !== 'OK') {
      return { status: 200, replay: true, fulfilled: false };
    }
  } catch {
    logSafepayWebhookRedisUnavailable({ reason: 'SAFEPAY_WEBHOOK_REDIS_ERROR', requestId: 'test' });
    return { status: 503, replay: false, fulfilled: false, code: 'SAFEPAY_WEBHOOK_REDIS_ERROR' };
  }

  ledger.tryClaim(digest);
  fulfillCount.count += 1;
  return { status: 200, replay: false, fulfilled: true };
}

console.log('safepayWebhookRedisFailClosed — H-05 tests\n');

console.log('Redis offline — no fulfillment');
{
  resetSafepayWebhookReplayMetricsForTests();
  const ledger = new MockLedger();
  const fulfillCount = { count: 0 };
  const digest = 'aa'.repeat(32);
  const result = await runFailClosedWebhookGate({
    redis: new MockRedisFailClosed({ offline: true }),
    ledger,
    digest,
    fulfillCount,
  });
  eq('returns 503', result.status, 503);
  eq('no fulfillment', fulfillCount.count, 0);
  eq('ledger untouched', ledger.isProcessed(digest), false);
  const metrics = getSafepayWebhookReplayMetrics();
  ok('redis unavailable counted', metrics.redisUnavailableCount >= 1);
  ok('blocked webhooks counted', metrics.blockedWebhooksWithoutFulfillment >= 1);
}

console.log('\nRedis timeout on SET — no fulfillment');
{
  resetSafepayWebhookReplayMetricsForTests();
  const ledger = new MockLedger();
  const fulfillCount = { count: 0 };
  const digest = 'bb'.repeat(32);
  const result = await runFailClosedWebhookGate({
    redis: new MockRedisFailClosed({ throwOnSet: 'ETIMEDOUT' }),
    ledger,
    digest,
    fulfillCount,
  });
  eq('returns 503 on timeout', result.status, 503);
  eq('error code', result.code, 'SAFEPAY_WEBHOOK_REDIS_ERROR');
  eq('no fulfillment on timeout', fulfillCount.count, 0);
}

console.log('\nRedis connection loss on SET — no fulfillment');
{
  const ledger = new MockLedger();
  const fulfillCount = { count: 0 };
  const digest = 'cc'.repeat(32);
  const result = await runFailClosedWebhookGate({
    redis: new MockRedisFailClosed({ throwOnSet: 'ECONNREFUSED' }),
    ledger,
    digest,
    fulfillCount,
  });
  eq('returns 503 on connection loss', result.status, 503);
  eq('no fulfillment on connection loss', fulfillCount.count, 0);
}

console.log('\nRedis healthy — fulfillment allowed');
{
  const ledger = new MockLedger();
  const fulfillCount = { count: 0 };
  const digest = 'dd'.repeat(32);
  const result = await runFailClosedWebhookGate({
    redis: new MockRedisFailClosed(),
    ledger,
    digest,
    fulfillCount,
  });
  ok('fulfillment proceeds when Redis healthy', result.fulfilled === true);
  eq('exactly one fulfillment', fulfillCount.count, 1);
}

console.log('\nRecovery observability');
{
  resetSafepayWebhookReplayMetricsForTests();
  logSafepayWebhookRedisRecovery({ source: 'redis_ready' });
  const metrics = getSafepayWebhookReplayMetrics();
  eq('recovery events tracked', metrics.redisRecoveryCount, 1);
}

mustContain(
  'src/services/safepayWebhookReplay.service.js',
  [
    'H-05: always fail-closed',
    'SAFEPAY_WEBHOOK_REDIS_REQUIRED',
    'SAFEPAY_WEBHOOK_REDIS_ERROR',
  ],
  'replay service fail-closed'
);

mustContain(
  'src/controllers/payments.controller.js',
  ['logSafepayWebhookRedisUnavailable', 'received: false'],
  'controller fail-closed response'
);

mustContain(
  'src/services/safepayWebhookReplayMetrics.service.js',
  [
    'redisUnavailableCount',
    'blockedWebhooksWithoutFulfillment',
    'redisRecoveryCount',
    'logSafepayWebhookRedisRecovery',
  ],
  'H-05 observability metrics'
);

mustContain(
  'src/config/redis.js',
  ['logSafepayWebhookRedisRecovery'],
  'redis recovery hook'
);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
