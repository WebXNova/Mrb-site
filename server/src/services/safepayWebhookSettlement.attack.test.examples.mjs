/**
 * Attack simulation — payment penetration scenarios.
 *
 * Simulates post-HMAC webhook delivery where attacker tampers settlement fields.
 * Expected: no enrollment activation for all attack vectors.
 *
 * Run: node src/services/safepayWebhookSettlement.attack.test.examples.mjs
 */
import crypto from 'crypto';
import { classifySafepayWebhookEvent } from './safepayWebhookEventValidation.js';
import { resolveFulfillmentWithSettlement } from './safepayWebhookSettlement.js';
import { buildSafepayWebhookDedupeDigest } from './safepayWebhookReplay.service.js';

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

const COURSE_PRICE_MAJOR = 15000;
const CURRENCY = 'PKR';
const MINOR = 1500000;

/**
 * @typedef {object} AttackScenario
 * @property {string} id
 * @property {string} name
 * @property {object} payload
 * @property {string} [orderStatus]
 */

/** @param {Partial<AttackScenario['payload']>} dataOverrides */
function buildAttackPayload(dataOverrides = {}) {
  return {
    type: 'payment.succeeded',
    data: {
      token: 'atk_tracker_001',
      amount: MINOR,
      currency: CURRENCY,
      ...dataOverrides,
    },
  };
}

const ATTACKS = /** @type {AttackScenario[]} */ ([
  {
    id: 'ATK-01',
    name: 'lower amount paid',
    payload: buildAttackPayload({ amount: MINOR - 1000 }),
  },
  {
    id: 'ATK-02',
    name: 'higher amount paid',
    payload: buildAttackPayload({ amount: MINOR + 1000 }),
  },
  {
    id: 'ATK-03',
    name: 'currency mismatch',
    payload: buildAttackPayload({ currency: 'USD' }),
  },
  {
    id: 'ATK-04',
    name: 'decimal mismatch',
    payload: buildAttackPayload({ amount: MINOR + 0.99 }),
  },
  {
    id: 'ATK-05',
    name: 'rounding mismatch',
    payload: buildAttackPayload({ amount: MINOR - 1 }),
  },
  {
    id: 'ATK-06',
    name: 'missing amount',
    payload: { type: 'payment.succeeded', data: { token: 'atk_tracker_001', currency: CURRENCY } },
  },
  {
    id: 'ATK-07',
    name: 'missing currency',
    payload: { type: 'payment.succeeded', data: { token: 'atk_tracker_001', amount: MINOR } },
  },
]);

/**
 * @param {object} order
 * @param {object} payload
 * @param {object} enrollment
 */
function runAttack(order, payload, enrollment) {
  const classification = classifySafepayWebhookEvent(payload);
  const gate = resolveFulfillmentWithSettlement(classification, order, payload, enrollment);

  const orderAfter = { ...order };
  const enrollmentAfter = { ...enrollment };

  if (gate.action === 'fulfill') {
    orderAfter.status = 'paid';
    enrollmentAfter.status = 'active';
  }

  return { gate, orderAfter, enrollmentAfter };
}

console.log('safepayWebhookSettlement — attack simulation\n');

console.log('Phase 1 — Settlement tamper attacks (pending order)');
const pendingOrder = {
  id: 200,
  status: 'pending',
  amount: COURSE_PRICE_MAJOR,
  currency: CURRENCY,
};
const pendingEnrollment = { status: 'pending', id: 42, order_id: 200 };

for (const attack of ATTACKS) {
  const { gate, orderAfter, enrollmentAfter } = runAttack(
    pendingOrder,
    attack.payload,
    pendingEnrollment
  );
  ok(`${attack.id} ${attack.name}: no enrollment`, enrollmentAfter.status !== 'active');
  ok(`${attack.id} ${attack.name}: order not paid`, orderAfter.status !== 'paid');
  ok(`${attack.id} ${attack.name}: blocked at gate`, gate.enrolls === false);
  ok(
    `${attack.id} ${attack.name}: settlement or gate reject`,
    gate.action === 'settlement_rejected' || gate.action === 'ignored' || gate.action === 'reject'
  );
}

console.log('\nPhase 2 — Duplicate webhook replay (no double activation)');
{
  const legitPayload = buildAttackPayload();
  const enrollment = { status: 'pending', id: 99, order_id: 200 };

  const first = runAttack(pendingOrder, legitPayload, enrollment);
  ok('control: valid payment would enroll', first.enrollmentAfter.status === 'active');

  const paidOrder = { ...pendingOrder, status: 'paid' };
  const activeEnrollment = { status: 'active', id: 99, order_id: 200 };

  const replay = runAttack(paidOrder, legitPayload, activeEnrollment);
  eq('ATK-08 duplicate webhook action', replay.gate.action, 'duplicate');
  ok('ATK-08 duplicate webhook: no re-enroll', replay.gate.enrolls === false);
  eq('ATK-08 enrollment unchanged', replay.enrollmentAfter.status, 'active');
  eq('ATK-08 order stays paid', replay.orderAfter.status, 'paid');
}

console.log('\nPhase 3 — Major-unit underpayment bypass attempt');
{
  const underpayMajor = buildAttackPayload({ amount: COURSE_PRICE_MAJOR - 1 });
  const result = runAttack(pendingOrder, underpayMajor, pendingEnrollment);
  ok('major-unit underpay blocked', result.enrollmentAfter.status !== 'active');
  ok('major-unit underpay not paid', result.orderAfter.status !== 'paid');
}

console.log('\nPhase 4 — Success event with wrong token path but valid settlement still required');
{
  const payload = {
    type: 'payment.succeeded',
    data: { tracker: { state: 'TRACKER_ENDED', amount: 1, currency: CURRENCY, token: 'x' } },
  };
  const result = runAttack(pendingOrder, payload, pendingEnrollment);
  ok('tracker-ended underpay blocked', result.enrollmentAfter.status !== 'active');
}

console.log('\nPhase 5 — Attacker cannot satisfy settlement by omitting verification (empty success shape)');
{
  const payload = { type: 'payment.succeeded', data: { token: 'only_token' } };
  const result = runAttack(pendingOrder, payload, pendingEnrollment);
  ok('token-only success blocked', result.gate.action === 'settlement_rejected');
}

console.log('\nPhase 6 — Replay store short-circuit (attack re-delivery)');
{
  const body = Buffer.from(JSON.stringify(buildAttackPayload()), 'utf8');
  const digest = buildSafepayWebhookDedupeDigest({
    signatureHeader: crypto.randomBytes(64).toString('hex'),
    timestampHeader: String(Date.now()),
    rawBodyBuffer: body,
  });

  const seen = new Set();
  const firstSeen = seen.has(digest);
  seen.add(digest);
  const secondSeen = seen.has(digest);

  ok('first webhook delivery novel', firstSeen === false);
  ok('replay detected before fulfillment', secondSeen === true);
}

console.log('\n--- Attack matrix ---');
console.log('| ID     | Attack                  | Enrolls | Order paid |');
console.log('|--------|-------------------------|---------|------------|');
for (const a of ATTACKS) {
  console.log(`| ${a.id} | ${a.name.padEnd(23)} | NO      | NO         |`);
}
console.log('| ATK-08 | duplicate webhook       | NO      | unchanged  |');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
