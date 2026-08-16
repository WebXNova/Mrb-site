/**
 * Admin coupon display helpers — submission snapshot formatting.
 * Run: node tests/manual-payment-coupon-display.test.examples.mjs
 */

import assert from 'node:assert/strict';
import {
  formatCouponAppliedSummary,
  formatCouponOffLabel,
  submissionUsedCoupon,
} from '../../client/src/admin/utils/manualPaymentCouponDisplay.js';
import { test, summary } from './_testUtils.mjs';

console.log('manual-payment-coupon-display — admin UI helpers');

test('submissionUsedCoupon is false without coupon snapshot', () => {
  assert.equal(submissionUsedCoupon({ amountClaimed: 5000 }), false);
  assert.equal(submissionUsedCoupon(null), false);
});

test('submissionUsedCoupon is true with coupon code', () => {
  assert.equal(submissionUsedCoupon({ couponCode: 'SAVE20' }), true);
});

test('formatCouponOffLabel uses percentage from snapshot amounts', () => {
  assert.equal(formatCouponOffLabel('percentage', 600, 3000), '20% off');
});

test('formatCouponOffLabel uses PKR for flat type', () => {
  assert.equal(formatCouponOffLabel('flat', 600, 3000), 'PKR 600 off');
});

test('formatCouponAppliedSummary builds detail line from submission snapshot', () => {
  const summary = formatCouponAppliedSummary({
    couponCode: 'SAVE20',
    couponDiscountType: 'percentage',
    discountApplied: 600,
    originalAmount: 3000,
  });
  assert.ok(summary);
  assert.equal(summary.code, 'SAVE20');
  assert.match(summary.line, /Coupon applied: SAVE20 \(20% off\)/);
  assert.match(summary.line, /Original: PKR 3,000 → Discounted: PKR 2,400/);
});

test('registrations row shape is supported', () => {
  const summary = formatCouponAppliedSummary({
    manualPaymentCouponCode: 'FLAT50',
    manualPaymentCouponDiscountType: 'flat',
    manualPaymentDiscountApplied: 500,
    manualPaymentOriginalAmount: 5000,
  });
  assert.ok(summary);
  assert.match(summary.line, /FLAT50 \(PKR 500 off\)/);
});

summary('manual-payment-coupon-display');
