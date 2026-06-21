/**
 * Checkout concurrency + stale-checkout scenario tests (in-memory lock simulator).
 *
 * Run: node src/services/payments.checkoutIntegrity.test.examples.mjs
 */
import { classifySafepayWebhookEvent } from './safepayWebhookEventValidation.js';
import { resolveFulfillmentWithSettlement } from './safepayWebhookSettlement.js';
import { ORDER_CANCELLATION_REASON_SUPERSEDED } from './orderCheckoutIntegrity.service.js';

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
 * In-memory store mirroring enrollment FOR UPDATE + supersede + single pending invariant.
 */
class CheckoutIntegritySimulator {
  constructor() {
    /** @type {Promise<void>} */
    this._lock = Promise.resolve();
    /** @type {Map<number, object>} */
    this.orders = new Map();
    /** @type {Map<number, { id: number, order_id: number|null }>} */
    this.enrollments = new Map();
    this._nextOrderId = 1;
  }

  /** @param {number} enrollmentId */
  seedEnrollment(enrollmentId) {
    this.enrollments.set(enrollmentId, { id: enrollmentId, order_id: null });
  }

  /**
   * @param {number} enrollmentId
   * @param {number} amount
   */
  async createCheckoutSession(enrollmentId, amount) {
    const prev = this._lock;
    let release = () => {};
    this._lock = new Promise((resolve) => {
      release = resolve;
    });
    await prev;

    try {
      for (const order of this.orders.values()) {
        if (order.enrollment_id === enrollmentId && order.status === 'pending') {
          order.status = 'cancelled';
          order.cancellation_reason = ORDER_CANCELLATION_REASON_SUPERSEDED;
          order.cancelled_at = Date.now();
        }
      }

      const pendingForEnrollment = [...this.orders.values()].filter(
        (o) => o.enrollment_id === enrollmentId && o.status === 'pending'
      );
      if (pendingForEnrollment.length > 0) {
        throw new Error('DUPLICATE_PENDING_ORDER');
      }

      const id = this._nextOrderId++;
      const order = {
        id,
        enrollment_id: enrollmentId,
        amount,
        currency: 'PKR',
        status: 'pending',
      };
      this.orders.set(id, order);
      const enr = this.enrollments.get(enrollmentId);
      if (!enr) throw new Error('ENROLLMENT_NOT_FOUND');
      enr.order_id = id;
      return { orderId: id, amount };
    } finally {
      release();
    }
  }

  /** @param {number} orderId */
  getOrder(orderId) {
    return this.orders.get(orderId) ?? null;
  }

  /** @param {number} enrollmentId */
  getEnrollment(enrollmentId) {
    return this.enrollments.get(enrollmentId) ?? null;
  }

  countPendingForEnrollment(enrollmentId) {
    return [...this.orders.values()].filter(
      (o) => o.enrollment_id === enrollmentId && o.status === 'pending'
    ).length;
  }
}

function paidPayload(amountMinor) {
  return {
    type: 'payment.succeeded',
    data: { token: 'tok', amount: amountMinor, currency: 'PKR' },
  };
}

function simulateFulfillment(sim, orderId) {
  const order = sim.getOrder(orderId);
  const enrollment = sim.getEnrollment(order.enrollment_id);
  const payload = paidPayload(order.amount * 100);
  const gate = resolveFulfillmentWithSettlement(
    classifySafepayWebhookEvent(payload),
    order,
    payload,
    enrollment
  );
  if (gate.enrolls) {
    order.status = 'paid';
    return { enrolled: true, gate };
  }
  return { enrolled: false, gate };
}

console.log('payments.checkoutIntegrity — concurrency + stale checkout tests\n');

async function runConcurrency(label, parallelCount) {
  const sim = new CheckoutIntegritySimulator();
  const enrollmentId = 77;
  sim.seedEnrollment(enrollmentId);

  const tasks = Array.from({ length: parallelCount }, (_, i) =>
    sim.createCheckoutSession(enrollmentId, 15000 + i)
  );
  const results = await Promise.all(tasks);
  ok(`${label}: all requests returned order id`, results.every((r) => r.orderId > 0));
  ok(`${label}: exactly one pending order`, sim.countPendingForEnrollment(enrollmentId) === 1);

  const pendingOrders = [...sim.orders.values()].filter(
    (o) => o.enrollment_id === enrollmentId && o.status === 'pending'
  );
  ok(`${label}: single pending order row`, pendingOrders.length === 1);

  const enr = sim.getEnrollment(enrollmentId);
  ok(`${label}: enrollment points to pending order`, enr.order_id === pendingOrders[0].id);
  ok(
    `${label}: last checkout wins (serialized)`,
    enr.order_id === results[results.length - 1].orderId
  );

  const cancelled = [...sim.orders.values()].filter(
    (o) => o.enrollment_id === enrollmentId && o.status === 'cancelled'
  );
  ok(`${label}: superseded count`, cancelled.length === parallelCount - 1);
}

console.log('Phase 1 — Concurrent checkout creation');
await runConcurrency('2 parallel', 2);
await runConcurrency('10 parallel', 10);
await runConcurrency('100 parallel', 100);

console.log('\nPhase 2 — Scenario A: pay old checkout after price increase');
{
  const sim = new CheckoutIntegritySimulator();
  const enrollmentId = 5;
  sim.seedEnrollment(enrollmentId);

  const first = await sim.createCheckoutSession(enrollmentId, 10000);
  const second = await sim.createCheckoutSession(enrollmentId, 15000);

  const oldOrder = sim.getOrder(first.orderId);
  eq('old order cancelled', oldOrder.status, 'cancelled');
  eq('old order supersede reason', oldOrder.cancellation_reason, ORDER_CANCELLATION_REASON_SUPERSEDED);

  const payOld = simulateFulfillment(sim, first.orderId);
  ok('pay old checkout rejected', payOld.enrolled === false);
  eq('pay old action', payOld.gate.action, 'stale_order');
}

console.log('\nPhase 3 — Scenario B: pay newest checkout');
{
  const sim = new CheckoutIntegritySimulator();
  const enrollmentId = 6;
  sim.seedEnrollment(enrollmentId);

  await sim.createCheckoutSession(enrollmentId, 10000);
  const latest = await sim.createCheckoutSession(enrollmentId, 15000);
  const payNew = simulateFulfillment(sim, latest.orderId);
  ok('pay new checkout succeeds', payNew.enrolled === true);
  eq('new order paid', sim.getOrder(latest.orderId).status, 'paid');
}

console.log('\nPhase 4 — Late webhook for cancelled order A');
{
  const sim = new CheckoutIntegritySimulator();
  const enrollmentId = 8;
  sim.seedEnrollment(enrollmentId);

  const orderA = await sim.createCheckoutSession(enrollmentId, 10000);
  const orderB = await sim.createCheckoutSession(enrollmentId, 15000);
  const stale = simulateFulfillment(sim, orderA.orderId);
  ok('late webhook order A rejected', stale.enrolled === false);
  eq('order A still cancelled', sim.getOrder(orderA.orderId).status, 'cancelled');
  eq('order B still pending', sim.getOrder(orderB.orderId).status, 'pending');
  eq('enrollment on order B', sim.getEnrollment(enrollmentId).order_id, orderB.orderId);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
