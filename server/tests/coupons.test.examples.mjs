/**
 * Coupon validation — code normalization, discount rules, date range.
 *
 * Run: node tests/coupons.test.examples.mjs
 */

import assert from 'node:assert/strict';
import { ApiError } from '../src/utils/apiError.js';
import {
  assertDiscountValueForType,
  parseCreateCouponBody,
  parseUpdateCouponBody,
  sanitizeCouponCode,
} from '../src/validators/coupon.schema.js';
import { test, summary } from './_testUtils.mjs';

console.log('coupons — validation');

test('sanitizeCouponCode uppercases and trims', () => {
  assert.equal(sanitizeCouponCode('  save20  '), 'SAVE20');
});

test('parseCreateCouponBody accepts valid percentage coupon', () => {
  const dto = parseCreateCouponBody({
    code: 'save20',
    course_id: 42,
    discount_type: 'percentage',
    discount_value: 20,
    usage_limit: 50,
    valid_from: '2026-08-01',
    valid_until: '2026-12-31',
  });
  assert.equal(dto.code, 'SAVE20');
  assert.equal(dto.course_id, 42);
  assert.equal(dto.discount_type, 'percentage');
  assert.equal(dto.discount_value, 20);
  assert.equal(dto.usage_limit, 50);
  assert.equal(dto.valid_from, '2026-08-01');
  assert.equal(dto.valid_until, '2026-12-31');
});

test('parseCreateCouponBody allows null valid_until', () => {
  const dto = parseCreateCouponBody({
    code: 'NOEXP',
    course_id: 1,
    discount_type: 'flat',
    discount_value: 500,
    usage_limit: 10,
    valid_from: '2026-01-01',
    valid_until: null,
  });
  assert.equal(dto.valid_until, null);
});

test('rejects invalid coupon code characters', () => {
  assert.throws(
    () =>
      parseCreateCouponBody({
        code: 'bad code!',
        course_id: 1,
        discount_type: 'percentage',
        discount_value: 10,
        usage_limit: 5,
        valid_from: '2026-01-01',
      }),
    (err) => err instanceof ApiError && err.statusCode === 422 && err.details?.field === 'code'
  );
});

test('rejects valid_until before valid_from', () => {
  assert.throws(
    () =>
      parseCreateCouponBody({
        code: 'RANGE',
        course_id: 1,
        discount_type: 'percentage',
        discount_value: 10,
        usage_limit: 5,
        valid_from: '2026-06-01',
        valid_until: '2026-05-01',
      }),
    (err) => err instanceof ApiError && err.statusCode === 422 && err.details?.code === 'INVALID_DATE_RANGE'
  );
});

test('rejects unknown payload keys via strict schema', () => {
  assert.throws(
    () =>
      parseCreateCouponBody({
        code: 'STRICT',
        course_id: 1,
        discount_type: 'percentage',
        discount_value: 10,
        usage_limit: 5,
        valid_from: '2026-01-01',
        used_count: 99,
      }),
    (err) => err instanceof ApiError && err.statusCode === 422
  );
});

test('assertDiscountValueForType rejects percentage above 100', () => {
  assert.throws(
    () => assertDiscountValueForType('percentage', 101, 5000),
    (err) => err instanceof ApiError && err.details?.field === 'discount_value'
  );
});

test('assertDiscountValueForType rejects flat above course price', () => {
  assert.throws(
    () => assertDiscountValueForType('flat', 6000, 5000),
    (err) => err instanceof ApiError && err.details?.field === 'discount_value'
  );
});

test('update parser matches create parser', () => {
  const dto = parseUpdateCouponBody({
    code: 'EDIT1',
    course_id: 7,
    discount_type: 'flat',
    discount_value: 1000,
    usage_limit: 3,
    valid_from: '2026-03-01',
  });
  assert.equal(dto.code, 'EDIT1');
  assert.equal(dto.course_id, 7);
});

summary('coupons');
