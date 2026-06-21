/**
 * H-02 payment session eligibility tests.
 *
 * Run: node src/services/paymentEligibility.test.examples.mjs
 */
import {
  evaluatePaymentSessionEligibility,
  PAYMENT_SESSION_INELIGIBLE_CODES,
} from './paymentEligibility.service.js';

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

function pendingEnrollment(overrides = {}) {
  return {
    id: 42,
    status: 'pending',
    access_status: 'inactive',
    order_id: null,
    ...overrides,
  };
}

function expectBlocked(label, result, code) {
  ok(`${label}: ineligible`, result.eligible === false);
  eq(`${label}: code`, result.code, code);
}

console.log('paymentEligibility — session gate tests\n');

console.log('Valid — pending enrollment');
{
  const result = evaluatePaymentSessionEligibility({
    enrollment: pendingEnrollment(),
    paidOrder: null,
    linkedOrder: null,
    userAccountStatus: 'active',
  });
  ok('pending inactive enrollment is eligible', result.eligible === true);
}

console.log('\nActive enrollment');
{
  const result = evaluatePaymentSessionEligibility({
    enrollment: pendingEnrollment({ access_status: 'active' }),
  });
  expectBlocked('active access', result, PAYMENT_SESSION_INELIGIBLE_CODES.ENROLLMENT_ACTIVE);
}

console.log('\nRejected enrollment');
{
  const result = evaluatePaymentSessionEligibility({
    enrollment: pendingEnrollment({ status: 'rejected' }),
  });
  expectBlocked('rejected', result, PAYMENT_SESSION_INELIGIBLE_CODES.ENROLLMENT_REJECTED);
}

console.log('\nApproved enrollment');
{
  const result = evaluatePaymentSessionEligibility({
    enrollment: pendingEnrollment({ status: 'approved' }),
  });
  expectBlocked('approved', result, PAYMENT_SESSION_INELIGIBLE_CODES.ENROLLMENT_APPROVED);
}

console.log('\nPaid enrollment');
{
  const result = evaluatePaymentSessionEligibility({
    enrollment: pendingEnrollment({ order_id: 200 }),
    linkedOrder: { id: 200, status: 'paid' },
  });
  expectBlocked('linked paid order', result, PAYMENT_SESSION_INELIGIBLE_CODES.PAID_ORDER_EXISTS);
}

{
  const result = evaluatePaymentSessionEligibility({
    enrollment: pendingEnrollment(),
    paidOrder: { id: 201, status: 'paid' },
  });
  expectBlocked('paid order on enrollment', result, PAYMENT_SESSION_INELIGIBLE_CODES.PAID_ORDER_EXISTS);
}

console.log('\nLocked enrollment');
{
  const revoked = evaluatePaymentSessionEligibility({
    enrollment: pendingEnrollment({ access_status: 'revoked' }),
  });
  expectBlocked('revoked access', revoked, PAYMENT_SESSION_INELIGIBLE_CODES.ENROLLMENT_LOCKED);
}

{
  const suspended = evaluatePaymentSessionEligibility({
    enrollment: pendingEnrollment(),
    userAccountStatus: 'suspended',
  });
  expectBlocked('suspended user', suspended, PAYMENT_SESSION_INELIGIBLE_CODES.ENROLLMENT_LOCKED);
}

console.log('\nInvalid enrollment state');
{
  const missing = evaluatePaymentSessionEligibility({ enrollment: null });
  expectBlocked('missing enrollment', missing, PAYMENT_SESSION_INELIGIBLE_CODES.ENROLLMENT_INVALID_STATE);
}

{
  const corrupt = evaluatePaymentSessionEligibility({
    enrollment: pendingEnrollment({ status: 'unknown' }),
  });
  expectBlocked('unknown status', corrupt, PAYMENT_SESSION_INELIGIBLE_CODES.ENROLLMENT_INVALID_STATE);
}

console.log('\nPending with unpaid linked order — still eligible');
{
  const result = evaluatePaymentSessionEligibility({
    enrollment: pendingEnrollment({ order_id: 300 }),
    linkedOrder: { id: 300, status: 'pending' },
  });
  ok('unpaid checkout may be superseded', result.eligible === true);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
