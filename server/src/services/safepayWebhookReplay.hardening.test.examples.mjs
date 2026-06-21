/**
 * H-04/H-05 Safepay webhook replay hardening tests.
 *
 * Run: node src/services/safepayWebhookReplay.hardening.test.examples.mjs
 */
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  buildSafepayWebhookDedupeDigest,
  getSafepayWebhookReplayConfig,
} from './safepayWebhookReplay.service.js';
import {
  getSafepayWebhookReplayMetrics,
  resetSafepayWebhookReplayMetricsForTests,
  logSafepayWebhookReplayBlocked,
  recordSafepayWebhookReplayDuplicate,
  logSafepayWebhookRedisUnavailable,
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

/** In-memory Redis SET NX simulator (per-key serialized like Redis INCR). */
class MockRedisReplayStore {
  constructor() {
    /** @type {Map<string, { value: string, expiresAt: number }>} */
    this.store = new Map();
    /** @type {Map<string, Promise<void>>} */
    this._locks = new Map();
    this.unavailable = false;
  }

  async _withLock(key, fn) {
    const prev = this._locks.get(key) ?? Promise.resolve();
    let release = () => {};
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    this._locks.set(key, prev.then(() => gate));
    await prev;
    try {
      return await fn();
    } finally {
      release();
    }
  }

  async set(key, value, { EX, NX } = {}) {
    return this._withLock(key, async () => {
      if (this.unavailable) throw new Error('redis_down');
      const now = Date.now();
      if (NX && this.store.has(key)) {
        const entry = this.store.get(key);
        if (!entry || entry.expiresAt > now) return null;
      }
      this.store.set(key, { value, expiresAt: now + (EX ?? 60) * 1000 });
      return 'OK';
    });
  }

  async get(key) {
    if (this.unavailable) throw new Error('redis_down');
    const entry = this.store.get(key);
    if (!entry || entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async del(key) {
    if (this.unavailable) throw new Error('redis_down');
    this.store.delete(key);
  }
}

/** In-memory processed_webhooks ledger. */
class MockProcessedWebhookLedger {
  constructor() {
    /** @type {Set<string>} */
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

  record(hash) {
    if (this.hashes.has(hash)) return 'duplicate';
    this.hashes.add(hash);
    return 'recorded';
  }

  remove(hash) {
    this.hashes.delete(hash);
  }
}

/**
 * Mirrors payments.controller.js replay gate (no fulfillment).
 */
async function runWebhookReplayGate({ digest, redis, ledger }) {
  if (ledger.isProcessed(digest)) {
    return { status: 200, replay: true, stage: 'db_precheck' };
  }

  if (!redis) {
    return { status: 503, replay: false, stage: 'redis_unavailable' };
  }

  if (redis) {
    const claim = await redis.set(`payments:sfpy:wh:replay:v2:${digest}`, 'processing', {
      EX: 120,
      NX: true,
    });
    if (claim !== 'OK') {
      return { status: 200, replay: true, stage: 'redis_replay' };
    }
    const dbClaim = ledger.tryClaim(digest);
    if (dbClaim === 'duplicate') {
      await redis.del(`payments:sfpy:wh:replay:v2:${digest}`);
      return { status: 200, replay: true, stage: 'db_claim' };
    }
  }

  return { status: 200, replay: false, stage: 'fulfill' };
}

async function simulateFulfillmentOnce(ledger, digest, fulfillCount) {
  const redis = new MockRedisReplayStore();
  const gate = await runWebhookReplayGate({
    digest,
    redis,
    ledger,
  });
  if (gate.replay) return false;
  fulfillCount.count += 1;
  return true;
}

console.log('safepayWebhookReplay — hardening tests\n');

console.log('Config');
{
  const config = getSafepayWebhookReplayConfig();
  ok('replay TTL configured', config.ttlSeconds >= 60);
  ok('processing TTL configured', config.processingTtlSeconds >= 30);
}

console.log('\nLayer 1 — Redis SET NX duplicate webhook');
{
  const redis = new MockRedisReplayStore();
  const ledger = new MockProcessedWebhookLedger();
  const digest = 'a'.repeat(64);
  const first = await runWebhookReplayGate({ digest, redis, ledger });
  const second = await runWebhookReplayGate({ digest, redis, ledger });
  ok('first delivery proceeds', first.stage === 'fulfill');
  ok('duplicate blocked after first claim', second.replay === true);
}

console.log('\nLayer 2 — database UNIQUE duplicate');
{
  const redis = new MockRedisReplayStore();
  const ledger = new MockProcessedWebhookLedger();
  const digest = 'b'.repeat(64);
  ledger.record(digest);
  const result = await runWebhookReplayGate({ digest, redis, ledger });
  eq('db precheck blocks replay', result.stage, 'db_precheck');
}

console.log('\nDB claim before fulfillment (Redis path)');
{
  const redis = new MockRedisReplayStore();
  const ledger = new MockProcessedWebhookLedger();
  const digest = 'g'.repeat(64);
  const first = await runWebhookReplayGate({ digest, redis, ledger, requireRedis: true });
  ok('first claim inserts ledger before fulfill', ledger.isProcessed(digest));
  ok('first delivery proceeds', first.stage === 'fulfill');
  const second = await runWebhookReplayGate({ digest, redis, ledger, requireRedis: true });
  eq('duplicate insert blocked at db precheck', second.stage, 'db_precheck');
}

console.log('\nReplay webhook — no duplicate fulfillment');
{
  const ledger = new MockProcessedWebhookLedger();
  const digest = 'c'.repeat(64);
  const fulfillCount = { count: 0 };
  const first = await simulateFulfillmentOnce(ledger, digest, fulfillCount);
  const second = await simulateFulfillmentOnce(ledger, digest, fulfillCount);
  ok('first webhook fulfills', first === true);
  ok('replay does not fulfill again', second === false);
  eq('exactly one fulfillment', fulfillCount.count, 1);
}

console.log('\nDelayed webhook — ledger blocks after first success');
{
  const redis = new MockRedisReplayStore();
  const ledger = new MockProcessedWebhookLedger();
  const digest = 'd'.repeat(64);
  await redis.set(`payments:sfpy:wh:replay:v2:${digest}`, 'acked', { EX: 3600 });
  ledger.record(digest);
  const delayed = await runWebhookReplayGate({ digest, redis, ledger });
  ok('delayed replay short-circuits', delayed.replay === true);
}

console.log('\nRedis unavailable — fail closed (always)');
{
  const ledger = new MockProcessedWebhookLedger();
  const digest = 'e'.repeat(64);
  const blocked = await runWebhookReplayGate({
    digest,
    redis: null,
    ledger,
  });
  eq('returns 503 when Redis required', blocked.status, 503);
}

console.log('\nConcurrent duplicate delivery');
{
  const redis = new MockRedisReplayStore();
  const ledger = new MockProcessedWebhookLedger();
  const digest = 'f'.repeat(64);
  const results = await Promise.all(
    Array.from({ length: 10 }, () =>
      runWebhookReplayGate({ digest, redis, ledger })
    )
  );
  const allowed = results.filter((r) => r.stage === 'fulfill').length;
  const blocked = results.filter((r) => r.replay).length;
  eq('only one concurrent delivery proceeds', allowed, 1);
  eq('nine concurrent duplicates blocked', blocked, 9);
}

console.log('\nMetrics');
{
  resetSafepayWebhookReplayMetricsForTests();
  logSafepayWebhookReplayBlocked({
    reason: 'redis_replay',
    webhookHash: 'ff'.repeat(32),
    requestId: 'req_test',
  });
  recordSafepayWebhookReplayDuplicate({
    webhookHash: 'ff'.repeat(32),
    requestId: 'req_test',
    layer: 'redis',
  });
  logSafepayWebhookRedisUnavailable({ reason: 'SAFEPAY_WEBHOOK_REDIS_REQUIRED', requestId: 'req_test' });
  const metrics = getSafepayWebhookReplayMetrics();
  ok('tracks blocked events', metrics.blockedEvents >= 2);
  ok('tracks replay attempts', metrics.replayAttempts >= 1);
  ok('tracks duplicate webhooks', metrics.duplicateWebhookCount >= 1);
}

console.log('\nDedupe digest stability');
{
  const raw = Buffer.from(JSON.stringify({ type: 'payment.succeeded' }), 'utf8');
  const digest = buildSafepayWebhookDedupeDigest({
    signatureHeader: 'sig',
    timestampHeader: '123',
    rawBodyBuffer: raw,
  });
  ok('digest length 64', digest.length === 64);
}

mustContain(
  'src/controllers/payments.controller.js',
  [
    'assertSafepayWebhookReplayClaim',
    'isWebhookHashProcessed',
    'tryClaimProcessedWebhook',
    'releaseSafepayWebhookReplayClaim',
    'logSafepayWebhookReplayBlocked',
  ],
  'controller replay hardening'
);

mustContain(
  'src/services/safepayWebhookReplay.service.js',
  ['NX: true', 'assertSafepayWebhookReplayClaim', 'SAFEPAY_WEBHOOK_REDIS_REQUIRED'],
  'redis SET NX replay service'
);

mustContain(
  'src/sql/migrations/processed_webhooks.sql',
  ['processed_webhooks', 'uq_processed_webhooks_hash'],
  'processed_webhooks migration'
);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
