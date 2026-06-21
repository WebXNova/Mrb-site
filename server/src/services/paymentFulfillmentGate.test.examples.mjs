/**
 * Unit tests — payment fulfillment eligibility gate.
 * Run: node src/services/paymentFulfillmentGate.test.examples.mjs
 */
import { evaluatePaymentFulfillmentEligibility } from './paymentFulfillmentGate.service.js';
import { PAYMENT_SECURITY_EVENTS } from './paymentSecurityEvents.js';

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

const ORDER = { id: 200, status: 'pending' };
const ENROLLMENT = { id: 42, order_id: 200 };

console.log('paymentFulfillmentGate — unit tests\n');

{
  const r = evaluatePaymentFulfillmentEligibility({
    order: ORDER,
    enrollment: ENROLLMENT,
    settlementOk: true,
  });
  ok('eligible path', r.eligible && r.action === 'fulfill');
}

{
  const r = evaluatePaymentFulfillmentEligibility({
    order: { id: 100, status: 'cancelled' },
    enrollment: { id: 42, order_id: 200 },
    settlementOk: true,
  });
  eq('cancelled order action', r.action, 'stale_order');
  eq('cancelled security event', r.securityEvent, PAYMENT_SECURITY_EVENTS.STALE_ORDER_PAYMENT_ATTEMPT);
}

{
  const r = evaluatePaymentFulfillmentEligibility({
    order: { id: 100, status: 'pending' },
    enrollment: { id: 42, order_id: 200 },
    settlementOk: true,
  });
  eq('stale pending order action', r.action, 'not_current_order');
  eq('stale pending security event', r.securityEvent, PAYMENT_SECURITY_EVENTS.ORDER_NOT_CURRENT_FOR_ENROLLMENT);
}

{
  const r = evaluatePaymentFulfillmentEligibility({
    order: ORDER,
    enrollment: ENROLLMENT,
    settlementOk: false,
  });
  eq('settlement fail action', r.action, 'settlement_rejected');
}

{
  const r = evaluatePaymentFulfillmentEligibility({
    order: { id: 200, status: 'paid' },
    enrollment: ENROLLMENT,
    settlementOk: true,
  });
  eq('already paid duplicate', r.action, 'duplicate');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
