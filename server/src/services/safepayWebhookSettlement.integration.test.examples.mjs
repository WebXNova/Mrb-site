/**
 * Integration tests — settlement gate combined with webhook event classification.
 *
 * Run: node src/services/safepayWebhookSettlement.integration.test.examples.mjs
 */
import { classifySafepayWebhookEvent } from './safepayWebhookEventValidation.js';
import {
  resolveFulfillmentWithSettlement,
  verifyWebhookSettlementAgainstOrder,
} from './safepayWebhookSettlement.js';
import {
  buildSafepayWebhookDedupeDigest,
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

const ORDER_AMOUNT = 15000;
const ORDER_CURRENCY = 'PKR';
const EXPECTED_MINOR = 1500000;

const BASE_ORDER = { id: 200, status: 'pending', amount: ORDER_AMOUNT, currency: ORDER_CURRENCY };
const BASE_ENROLLMENT = { id: 42, order_id: 200 };

function paidSuccessPayload(overrides = {}) {
  return {
    type: 'payment.succeeded',
    data: {
      token: 'tok_integration',
      amount: EXPECTED_MINOR,
      currency: ORDER_CURRENCY,
      ...overrides,
    },
  };
}

/**
 * In-memory fulfillment simulator (no MySQL).
 * @param {{ status: string, amount: number, currency: string }} order
 * @param {object} payload
 * @param {{ status: string }} enrollment
 */
function simulateWebhookFulfillment(order, payload, enrollment) {
  const classification = classifySafepayWebhookEvent(payload);
  const gate = resolveFulfillmentWithSettlement(classification, order, payload, enrollment);
  const next = {
    order: { ...order },
    enrollment: { ...enrollment },
    gate,
  };

  if (gate.action === 'fulfill') {
    next.order.status = 'paid';
    next.enrollment.status = 'active';
  } else if (gate.action === 'mark_failed') {
    next.order.status = 'failed';
  }

  return next;
}

console.log('safepayWebhookSettlement — integration tests\n');

console.log('Phase 1 — End-to-end gate (event + settlement + order state)');
/** @type {Array<{ id: string, payload: object, order: object, expectAction: string, enrolls: boolean }>} */
const integrationCases = [
  {
    id: 'S01',
    payload: paidSuccessPayload(),
    order: BASE_ORDER,
    enrollment: BASE_ENROLLMENT,
    expectAction: 'fulfill',
    enrolls: true,
  },
  {
    id: 'S02',
    payload: paidSuccessPayload({ amount: EXPECTED_MINOR - 500 }),
    order: BASE_ORDER,
    expectAction: 'settlement_rejected',
    enrolls: false,
  },
  {
    id: 'S03',
    payload: paidSuccessPayload({ amount: EXPECTED_MINOR + 500 }),
    order: BASE_ORDER,
    expectAction: 'settlement_rejected',
    enrolls: false,
  },
  {
    id: 'S04',
    payload: paidSuccessPayload({ currency: 'USD' }),
    order: BASE_ORDER,
    expectAction: 'settlement_rejected',
    enrolls: false,
  },
  {
    id: 'S05',
    payload: paidSuccessPayload({ amount: EXPECTED_MINOR + 0.25 }),
    order: BASE_ORDER,
    expectAction: 'settlement_rejected',
    enrolls: false,
  },
  {
    id: 'S06',
    payload: paidSuccessPayload({ amount: EXPECTED_MINOR - 1 }),
    order: BASE_ORDER,
    expectAction: 'settlement_rejected',
    enrolls: false,
  },
  {
    id: 'S07',
    payload: { type: 'payment.succeeded', data: { token: 'tok', currency: ORDER_CURRENCY } },
    order: BASE_ORDER,
    expectAction: 'settlement_rejected',
    enrolls: false,
  },
  {
    id: 'S08',
    payload: { type: 'payment.succeeded', data: { token: 'tok', amount: EXPECTED_MINOR } },
    order: BASE_ORDER,
    expectAction: 'settlement_rejected',
    enrolls: false,
  },
  {
    id: 'S09',
    payload: paidSuccessPayload(),
    order: { ...BASE_ORDER, status: 'paid' },
    expectAction: 'duplicate',
    enrolls: false,
  },
  {
    id: 'S10',
    payload: { type: 'payment.failed', data: { token: 'tok', amount: EXPECTED_MINOR, currency: ORDER_CURRENCY } },
    order: BASE_ORDER,
    expectAction: 'mark_failed',
    enrolls: false,
  },
];

for (const c of integrationCases) {
  const enrollment = c.enrollment ?? BASE_ENROLLMENT;
  const classification = classifySafepayWebhookEvent(c.payload);
  const gate = resolveFulfillmentWithSettlement(classification, c.order, c.payload, enrollment);
  eq(`${c.id} action`, gate.action, c.expectAction);
  eq(`${c.id} enrollment activation`, gate.enrolls, c.enrolls);

  const sim = simulateWebhookFulfillment(c.order, c.payload, { ...enrollment, status: 'pending' });
  eq(`${c.id} sim enrolls`, sim.enrollment.status === 'active', c.enrolls);
  if (!c.enrolls) {
    ok(`${c.id} order not paid on reject`, sim.order.status !== 'paid' || c.order.status === 'paid');
  }
}

console.log('\nPhase 1b — Stale / superseded order blocked');
{
  const staleOrder = { id: 100, status: 'cancelled', amount: ORDER_AMOUNT, currency: ORDER_CURRENCY };
  const currentEnrollment = { id: 42, order_id: 200 };
  const payload = paidSuccessPayload({ amount: 1000000 });
  const classification = classifySafepayWebhookEvent(payload);
  const gate = resolveFulfillmentWithSettlement(classification, staleOrder, payload, currentEnrollment);
  eq('stale cancelled order action', gate.action, 'stale_order');
  ok('stale cancelled order no enroll', gate.enrolls === false);

  const oldPending = { id: 100, status: 'pending', amount: 10000, currency: ORDER_CURRENCY };
  const mismatchEnrollment = { id: 42, order_id: 200 };
  const oldPayload = paidSuccessPayload({ amount: 1000000 });
  const oldGate = resolveFulfillmentWithSettlement(
    classifySafepayWebhookEvent(oldPayload),
    oldPending,
    oldPayload,
    mismatchEnrollment
  );
  eq('historical order not current', oldGate.action, 'stale_order');
  ok('historical price blocked', oldGate.enrolls === false);
}

console.log('\nPhase 2 — Duplicate webhook (no second activation)');
{
  const payload = paidSuccessPayload({ token: 'dup_tok' });
  const enrollment = { id: 42, order_id: 200, status: 'pending' };

  const first = simulateWebhookFulfillment(BASE_ORDER, payload, enrollment);
  eq('first delivery activates', first.enrollment.status, 'active');
  eq('first delivery marks paid', first.order.status, 'paid');

  const paidOrder = { ...BASE_ORDER, status: 'paid' };
  const activeEnrollment = { id: 42, order_id: 200, status: 'active' };

  const second = simulateWebhookFulfillment(paidOrder, payload, activeEnrollment);
  eq('duplicate action', second.gate.action, 'duplicate');
  ok('duplicate does not re-enroll', second.gate.enrolls === false);
  eq('enrollment still active once', second.enrollment.status, 'active');
  eq('order stays paid', second.order.status, 'paid');
}

console.log('\nPhase 3 — Replay digest + settlement (signed body tamper)');
{
  const legitBody = Buffer.from(JSON.stringify(paidSuccessPayload()), 'utf8');
  const tamperedBody = Buffer.from(
    JSON.stringify(paidSuccessPayload({ amount: 1 })),
    'utf8'
  );
  const sig = 'b'.repeat(128);
  const ts = '1700000001';

  const legitDigest = buildSafepayWebhookDedupeDigest({
    signatureHeader: sig,
    timestampHeader: ts,
    rawBodyBuffer: legitBody,
  });
  const tamperedDigest = buildSafepayWebhookDedupeDigest({
    signatureHeader: sig,
    timestampHeader: ts,
    rawBodyBuffer: tamperedBody,
  });
  ok('amount tamper changes dedupe digest', legitDigest !== tamperedDigest);

  const tamperedPayload = JSON.parse(tamperedBody.toString('utf8'));
  const settlement = verifyWebhookSettlementAgainstOrder(BASE_ORDER, tamperedPayload);
  ok('tampered amount fails settlement', settlement.ok === false);
}

console.log('\n--- Expected results (settlement integration) ---');
console.log('| ID  | Scenario              | Action               | Enrolls |');
console.log('|-----|-----------------------|----------------------|---------|');
console.log('| S01 | valid amount/currency | fulfill              | YES     |');
console.log('| S02 | lower amount          | settlement_rejected  | NO      |');
console.log('| S03 | higher amount         | settlement_rejected  | NO      |');
console.log('| S04 | currency mismatch     | settlement_rejected  | NO      |');
console.log('| S05 | decimal mismatch      | settlement_rejected  | NO      |');
console.log('| S06 | rounding mismatch     | settlement_rejected  | NO      |');
console.log('| S07 | missing amount        | settlement_rejected  | NO      |');
console.log('| S08 | missing currency      | settlement_rejected  | NO      |');
console.log('| S09 | duplicate on paid     | duplicate            | NO      |');
console.log('| S10 | failed payment event  | mark_failed          | NO      |');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
