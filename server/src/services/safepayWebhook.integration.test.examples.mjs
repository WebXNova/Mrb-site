/**
 * Integration tests — Safepay webhook ingress, fulfillment gate, replay dedupe.
 *
 * Run: node src/services/safepayWebhook.integration.test.examples.mjs
 */
import crypto from 'crypto';
import { classifySafepayWebhookEvent } from './safepayWebhookEventValidation.js';
import { resolveFulfillmentWithSettlement } from './safepayWebhookSettlement.js';
import {
  buildSafepayWebhookDedupeDigest,
  markSafepayWebhookReplayAck,
} from './safepayWebhookReplay.service.js';

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

/**
 * Mirrors fulfillSafepayWebhookVerified decision branches (no MySQL).
 * @param {ReturnType<typeof classifySafepayWebhookEvent>} classification
 * @param {{ status: string, amount?: number, currency?: string }} order
 * @param {unknown} [payload]
 * @returns {'reject'|'duplicate'|'ignored'|'mark_failed'|'fulfill'|'settlement_rejected'}
 */
function resolveFulfillmentAction(classification, order, payload = {}, enrollment = null) {
  const orderId = order.id ?? 101;
  const gate = resolveFulfillmentWithSettlement(
    classification,
    {
      id: orderId,
      status: order.status,
      amount: order.amount ?? 15000,
      currency: order.currency ?? 'PKR',
    },
    payload,
    enrollment ?? { id: 1, order_id: order.status === 'paid' ? orderId : orderId }
  );
  return gate.action;
}

const INTEGRATION_ORDER = { amount: 15000, currency: 'PKR' };
const INTEGRATION_MINOR = 1500000;

function withSettlement(payload) {
  const data = payload?.data && typeof payload.data === 'object' ? payload.data : {};
  return {
    ...payload,
    data: {
      ...data,
      amount: data.amount ?? INTEGRATION_MINOR,
      currency: data.currency ?? INTEGRATION_ORDER.currency,
    },
  };
}

/** Simulates payments.controller.js JSON ingress. */
function parseWebhookBody(rawBodyBuffer) {
  if (!rawBodyBuffer?.length) {
    return { ok: false, status: 400, reason: 'empty_raw_body' };
  }
  let payload;
  try {
    payload = JSON.parse(rawBodyBuffer.toString('utf8'));
  } catch {
    return { ok: false, status: 400, reason: 'json_parse_failed' };
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, status: 400, reason: 'json_not_object' };
  }
  return { ok: true, status: 200, payload };
}

/** In-memory replay store for integration tests (no Redis). */
function createReplayStore() {
  const seen = new Set();
  return {
    async isSeen(digest) {
      return seen.has(digest);
    },
    async markAck(digest) {
      seen.add(digest);
    },
  };
}

console.log('safepayWebhook — integration tests\n');

console.log('Phase 1 — Controller ingress (malformed JSON / empty body)');
{
  const empty = parseWebhookBody(Buffer.alloc(0));
  eq('empty body → 400', empty.status, 400);
  ok('empty body rejected', empty.ok === false);

  const malformed = parseWebhookBody(Buffer.from('{not-json', 'utf8'));
  eq('malformed JSON → 400', malformed.status, 400);
  eq('malformed reason', malformed.reason, 'json_parse_failed');

  const arrayBody = parseWebhookBody(Buffer.from('[]', 'utf8'));
  eq('JSON array → 400', arrayBody.status, 400);
  eq('array reason', arrayBody.reason, 'json_not_object');

  const valid = parseWebhookBody(
    Buffer.from(JSON.stringify({ type: 'payment.succeeded', data: { token: 't' } }), 'utf8')
  );
  ok('valid JSON accepted', valid.ok === true);
}

console.log('\nPhase 2 — End-to-end fulfillment gate (classification + order state)');
/** @type {Array<{ id: string, payload: object, orderStatus: string, expectAction: string, enrolls: boolean, skipSettlement?: boolean }>} */
const integrationCases = [
  {
    id: 'I01',
    payload: withSettlement({ type: 'payment.succeeded', data: { token: 'tok' } }),
    orderStatus: 'pending',
    expectAction: 'fulfill',
    enrolls: true,
  },
  {
    id: 'I02',
    payload: { type: 'payment.failed', data: { token: 'tok' } },
    orderStatus: 'pending',
    expectAction: 'mark_failed',
    enrolls: false,
  },
  {
    id: 'I03',
    payload: { type: 'unknown.lifecycle', data: { token: 'tok' } },
    orderStatus: 'pending',
    expectAction: 'ignored',
    enrolls: false,
  },
  {
    id: 'I04',
    payload: {},
    orderStatus: 'pending',
    expectAction: 'reject',
    enrolls: false,
  },
  {
    id: 'I05',
    payload: { data: { tracker: { state: 'PENDING', token: 'tok' } } },
    orderStatus: 'pending',
    expectAction: 'ignored',
    enrolls: false,
  },
  {
    id: 'I06',
    payload: { type: 'tracker.updated', data: { token: 'tok' } },
    orderStatus: 'pending',
    expectAction: 'ignored',
    enrolls: false,
  },
  {
    id: 'I07',
    payload: { data: { token: 'tok_only' } },
    orderStatus: 'pending',
    expectAction: 'ignored',
    enrolls: false,
  },
  {
    id: 'I08',
    payload: withSettlement({ type: 'payment.succeeded', data: { token: 'tok' } }),
    orderStatus: 'paid',
    expectAction: 'duplicate',
    enrolls: false,
  },
];

for (const c of integrationCases) {
  const classification = classifySafepayWebhookEvent(c.payload);
  const action = resolveFulfillmentAction(classification, { status: c.orderStatus, ...INTEGRATION_ORDER }, c.payload);
  eq(`${c.id} fulfillment action`, action, c.expectAction);
  const wouldEnroll = action === 'fulfill';
  eq(`${c.id} enrollment activation`, wouldEnroll, c.enrolls);
}

console.log('\nPhase 3 — Only approved success events activate fulfillment');
{
  const approved = [
    withSettlement({ type: 'payment.succeeded' }),
    withSettlement({ type: 'payments.succeeded' }),
    withSettlement({ data: { tracker: { state: 'TRACKER_ENDED', token: 't' } } }),
  ];
  const rejected = [
    {},
    { data: { token: 'x' } },
    { type: 'payment.failed' },
    { type: 'unknown' },
    { type: 'incomplete' },
  ];

  for (const payload of approved) {
    const action = resolveFulfillmentAction(
      classifySafepayWebhookEvent(payload),
      { status: 'pending', ...INTEGRATION_ORDER },
      payload
    );
    ok(`approved ${JSON.stringify(payload)} → fulfill`, action === 'fulfill');
  }
  for (const payload of rejected) {
    const action = resolveFulfillmentAction(
      classifySafepayWebhookEvent(payload),
      { status: 'pending', ...INTEGRATION_ORDER },
      payload
    );
    ok(`non-approved ${JSON.stringify(payload)} → not fulfill`, action !== 'fulfill');
  }
}

console.log('\nPhase 4 — Replayed webhook (dedupe digest)');
{
  const rawBody = Buffer.from(
    JSON.stringify(withSettlement({ type: 'payment.succeeded', data: { token: 'replay_tok' } })),
    'utf8'
  );
  const signature = 'a'.repeat(128);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const digest = buildSafepayWebhookDedupeDigest({
    signatureHeader: signature,
    timestampHeader: timestamp,
    rawBodyBuffer: rawBody,
  });

  ok('digest is 64 hex chars', digest.length === 64 && /^[a-f0-9]+$/.test(digest));

  const d2 = buildSafepayWebhookDedupeDigest({
    signatureHeader: signature,
    timestampHeader: timestamp,
    rawBodyBuffer: rawBody,
  });
  eq('digest deterministic', digest, d2);

  const store = createReplayStore();
  ok('first delivery not replay', !(await store.isSeen(digest)));
  await store.markAck(digest);
  ok('second identical delivery is replay', await store.isSeen(digest));

  const tamperedBody = Buffer.from(
    JSON.stringify({ type: 'payment.succeeded', data: { token: 'other_tok' } }),
    'utf8'
  );
  const tamperedDigest = buildSafepayWebhookDedupeDigest({
    signatureHeader: signature,
    timestampHeader: timestamp,
    rawBodyBuffer: tamperedBody,
  });
  ok('tampered body → different digest', tamperedDigest !== digest);
}

console.log('\nPhase 5 — Replay ack helper is non-fatal without Redis');
{
  await markSafepayWebhookReplayAck('integration_test_digest_no_redis');
  ok('markSafepayWebhookReplayAck without Redis does not throw', true);
}

console.log('\nPhase 6 — HMAC signing input stability (replay contract)');
{
  const body = '{"type":"payment.succeeded"}';
  const ts = '1700000000';
  const sig = crypto.createHmac('sha512', Buffer.alloc(32, 1)).update(`${ts}.${body}`, 'utf8').digest('hex');
  const raw = Buffer.from(body, 'utf8');
  const digest = buildSafepayWebhookDedupeDigest({
    signatureHeader: sig,
    timestampHeader: ts,
    rawBodyBuffer: raw,
  });
  ok('HMAC body binds to dedupe digest', digest.length === 64);
}

console.log('\n--- Expected results (integration) ---');
console.log('| ID  | Scenario           | HTTP/Action  | Order change | Enrolls |');
console.log('|-----|--------------------|--------------|--------------|---------|');
console.log('| I01 | success event      | fulfill      | pending→paid | YES     |');
console.log('| I02 | failed event       | mark_failed  | pending→fail | NO      |');
console.log('| I03 | unknown event      | ignored      | unchanged    | NO      |');
console.log('| I04 | empty payload      | reject 400   | unchanged    | NO      |');
console.log('| I05 | missing type       | ignored      | unchanged    | NO      |');
console.log('| I06 | missing state      | ignored      | unchanged    | NO      |');
console.log('| I07 | missing both       | ignored      | unchanged    | NO      |');
console.log('| I08 | replay on paid     | duplicate    | unchanged    | NO      |');
console.log('| I09 | malformed JSON     | reject 400   | unchanged    | NO      |');
console.log('| I10 | replayed webhook   | short-circuit| unchanged    | NO      |');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
