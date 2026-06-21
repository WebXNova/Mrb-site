import assert from 'node:assert/strict';
import {
  classifyCoursePricingCategory,
  ENROLLMENT_PRICING_CATEGORY,
  isFreeCoursePricingType,
  isPaidCoursePricingType,
} from '../constants/coursePricingTypes.js';

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`);
    throw err;
  }
}

console.log('coursePricingTypes — enrollment classification');

test('free pricing type recognized', () => {
  assert.equal(isFreeCoursePricingType('free'), true);
  assert.equal(isPaidCoursePricingType('free'), false);
});

test('paid pricing types recognized', () => {
  assert.equal(isPaidCoursePricingType('one_time'), true);
  assert.equal(isPaidCoursePricingType('subscription'), true);
});

test('free course with zero price', () => {
  const r = classifyCoursePricingCategory({ type: 'free', price_amount: 0 });
  assert.equal(r.category, ENROLLMENT_PRICING_CATEGORY.FREE);
});

test('free course with non-zero price rejected', () => {
  const r = classifyCoursePricingCategory({ type: 'free', price_amount: 100 });
  assert.equal(r.category, null);
  assert.equal(r.error, 'free_course_price_must_be_zero');
});

test('paid course with positive price', () => {
  const r = classifyCoursePricingCategory({ type: 'one_time', price_amount: 2500 });
  assert.equal(r.category, ENROLLMENT_PRICING_CATEGORY.PAID);
});

test('paid course with zero price rejected (no payment bypass)', () => {
  const r = classifyCoursePricingCategory({ type: 'one_time', price_amount: 0 });
  assert.equal(r.category, null);
  assert.equal(r.error, 'paid_course_price_must_be_positive');
});

test('missing pricing rejected', () => {
  const r = classifyCoursePricingCategory(null);
  assert.equal(r.error, 'pricing_not_configured');
});

console.log('coursePricingTypes tests passed');
