/**
 * Manual payment coupon redemption — validation, discount math, fraud alignment.
 * Run: node tests/manual-payment-coupon.test.examples.mjs
 */

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import { ApiError } from '../src/utils/apiError.js';
import { mysqlPool, verifyMySqlConnection } from '../src/config/mysql.js';
import { ensureCouponsSchema } from '../src/db/ensureCouponsSchema.js';
import { ensureManualPaymentsSchema } from '../src/db/ensureManualPaymentsSchema.js';
import {
  assertCouponEligibility,
  computeCouponDiscount,
  COUPON_VALIDATION_MESSAGES,
  resolveManualPaymentExpectedAmount,
} from '../src/services/couponRedemption.service.js';
import {
  computeManualPaymentRisk,
  MANUAL_PAYMENT_RISK_FLAGS,
  parseRiskFlagsJson,
} from '../src/services/manualPaymentRisk.service.js';
import {
  deleteManualPaymentsForTests,
  submitManualPayment,
} from '../src/services/manualPayments.service.js';
import { test, testAsync, summary } from './_testUtils.mjs';

console.log('manual-payment-coupon — discount math');

test('percentage discount computes correctly', () => {
  const result = computeCouponDiscount(5000, 'percentage', 20);
  assert.equal(result.originalAmount, 5000);
  assert.equal(result.discountApplied, 1000);
  assert.equal(result.discountedAmount, 4000);
});

test('flat discount is capped at original amount', () => {
  const result = computeCouponDiscount(5000, 'flat', 6000);
  assert.equal(result.discountApplied, 5000);
  assert.equal(result.discountedAmount, 0);
});

test('resolveManualPaymentExpectedAmount uses coupon columns when present', () => {
  assert.equal(
    resolveManualPaymentExpectedAmount({
      amount_expected: 5000,
      original_amount: 5000,
      discount_applied: 1000,
    }),
    4000
  );
  assert.equal(
    resolveManualPaymentExpectedAmount({ amount_expected: 5000 }),
    5000
  );
});

console.log('\nmanual-payment-coupon — validation messages');

test('inactive coupon returns specific message', () => {
  assert.throws(
    () =>
      assertCouponEligibility(
        {
          is_active: false,
          course_id: 1,
          valid_from: '2020-01-01',
          valid_until: null,
          used_count: 0,
          usage_limit: 10,
        },
        1,
        '2026-08-16'
      ),
    (err) => err instanceof ApiError && err.message === COUPON_VALIDATION_MESSAGES.INACTIVE
  );
});

test('wrong course returns specific message', () => {
  assert.throws(
    () =>
      assertCouponEligibility(
        {
          is_active: true,
          course_id: 2,
          valid_from: '2020-01-01',
          valid_until: null,
          used_count: 0,
          usage_limit: 10,
        },
        1,
        '2026-08-16'
      ),
    (err) => err instanceof ApiError && err.message === COUPON_VALIDATION_MESSAGES.WRONG_COURSE
  );
});

test('usage limit returns specific message', () => {
  assert.throws(
    () =>
      assertCouponEligibility(
        {
          is_active: true,
          course_id: 1,
          valid_from: '2020-01-01',
          valid_until: null,
          used_count: 5,
          usage_limit: 5,
        },
        1,
        '2026-08-16'
      ),
    (err) => err instanceof ApiError && err.message === COUPON_VALIDATION_MESSAGES.USAGE_LIMIT
  );
});

console.log('\nmanual-payment-coupon — fraud amount alignment');

test('discounted payment at exact expected amount is NOT flagged amount_mismatch', () => {
  const pricing = computeCouponDiscount(5000, 'percentage', 20);
  const risk = computeManualPaymentRisk({
    studentId: 1,
    amountClaimed: pricing.discountedAmount,
    expectedAmount: pricing.discountedAmount,
    pendingTrxMatches: [],
    screenshotMatches: [],
    recentDifferentTrxCount: 0,
    priorSenderNumbers: [],
    senderPhone: '03001234567',
  });
  assert.equal(risk.riskLevel, 'low');
  assert.equal(risk.flags.includes(MANUAL_PAYMENT_RISK_FLAGS.AMOUNT_MISMATCH), false);
});

test('discounted payment compared to list price WOULD mismatch (documents why server must use discounted expected)', () => {
  const pricing = computeCouponDiscount(5000, 'percentage', 20);
  const wrongRisk = computeManualPaymentRisk({
    studentId: 1,
    amountClaimed: pricing.discountedAmount,
    expectedAmount: pricing.originalAmount,
    pendingTrxMatches: [],
    screenshotMatches: [],
    recentDifferentTrxCount: 0,
    priorSenderNumbers: [],
    senderPhone: '03001234567',
  });
  assert.ok(wrongRisk.flags.includes(MANUAL_PAYMENT_RISK_FLAGS.AMOUNT_MISMATCH));
});

console.log('\nmanual-payment-coupon — database integration');

function sha(text) {
  return createHash('sha256').update(String(text)).digest('hex');
}

function screenshotStub(hash) {
  return {
    url: `/api/uploads/manual-payments/${hash.slice(0, 16)}.png`,
    sha256: hash,
    storedPath: path.join(os.tmpdir(), `mp-coupon-${hash.slice(0, 8)}`),
  };
}

const createdEnrollmentIds = [];
const createdOrderIds = [];
const createdPaymentIds = [];
const createdCouponIds = [];

async function insertableEnrollmentColumns() {
  const [cols] = await mysqlPool.query(
    `SELECT COLUMN_NAME AS name, EXTRA AS extra
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'enrollments'`
  );
  return cols.filter((col) => !String(col.extra || '').toUpperCase().includes('GENERATED') && col.name !== 'id');
}

async function createPendingOrderForUser(userId, courseId, amount, stamp) {
  const [[template]] = await mysqlPool.query(`SELECT * FROM enrollments ORDER BY id DESC LIMIT 1`);
  if (!template) return null;

  const columns = await insertableEnrollmentColumns();
  const values = columns.map((col) => {
    const name = col.name;
    if (name === 'user_id') return userId;
    if (name === 'course_id') return courseId;
    if (name === 'order_id') return null;
    if (name === 'email') return `mp-coupon-${stamp}-${userId}@example.test`;
    if (name === 'status') return 'pending';
    if (name === 'access_status') return 'inactive';
    if (name === 'enrollment_source') return 'paid';
    if (name === 'admin_note' || name === 'reviewed_by' || name === 'reviewed_at' || name === 'switch_confirmed_at') {
      return null;
    }
    return template[name] ?? null;
  });

  const [enrollResult] = await mysqlPool.query(
    `INSERT INTO enrollments (${columns.map((col) => `\`${col.name}\``).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
    values
  );
  const enrollmentId = Number(enrollResult.insertId);
  createdEnrollmentIds.push(enrollmentId);

  const [orderResult] = await mysqlPool.query(
    `INSERT INTO orders (user_id, course_id, enrollment_id, gateway, amount, currency, status)
     VALUES (?, ?, ?, 'manual', ?, 'PKR', 'pending')`,
    [userId, courseId, enrollmentId, amount]
  );
  const orderId = Number(orderResult.insertId);
  createdOrderIds.push(orderId);
  return { orderId, enrollmentId, courseId, amount, userId };
}

async function createTestCoupon({ code, courseId, adminUserId, usageLimit = 1 }) {
  const [result] = await mysqlPool.query(
    `INSERT INTO coupons
      (code, course_id, discount_type, discount_value, usage_limit, used_count, valid_from, valid_until, is_active, created_by, updated_by)
     VALUES (?, ?, 'percentage', 20, ?, 0, '2020-01-01', NULL, TRUE, ?, ?)`,
    [code, courseId, usageLimit, adminUserId, adminUserId]
  );
  const id = Number(result.insertId);
  createdCouponIds.push(id);
  return id;
}

try {
  await verifyMySqlConnection();
  await ensureCouponsSchema(mysqlPool);
  await ensureManualPaymentsSchema(mysqlPool);

  const [students] = await mysqlPool.query(
    `SELECT id FROM users WHERE role = 'student' ORDER BY id ASC LIMIT 2`
  );
  const [admins] = await mysqlPool.query(
    `SELECT id FROM users WHERE role IN ('admin', 'super_admin') ORDER BY id ASC LIMIT 1`
  );
  const [courses] = await mysqlPool.query(`SELECT id FROM courses ORDER BY id ASC LIMIT 1`);

  const studentA = students[0] ? Number(students[0].id) : null;
  const studentB = students[1] ? Number(students[1].id) : null;
  const adminId = admins[0] ? Number(admins[0].id) : studentA;
  const courseId = courses[0] ? Number(courses[0].id) : null;
  const stamp = `${Date.now()}`.slice(-8);

  if (!studentA || !studentB || !courseId || !adminId) {
    console.log('  ⚠ skipped DB integration — need students, course, admin');
  } else {
    const couponCode = `MP${stamp}`;
    await createTestCoupon({ code: couponCode, courseId, adminUserId: adminId, usageLimit: 5 });

    const order = await createPendingOrderForUser(studentA, courseId, 5000, `${stamp}A`);
    if (order) {
      await testAsync('valid coupon submit increments used_count once and avoids amount_mismatch', async () => {
        const [[before]] = await mysqlPool.query(`SELECT used_count FROM coupons WHERE code = ?`, [couponCode]);
        const submit = await submitManualPayment({
          studentId: studentA,
          orderId: order.orderId,
          body: {
            payment_method: 'easypaisa',
            sender_phone_number: '03001234567',
            sender_account_title: 'Coupon Student',
            transaction_id: `CPN${stamp}001`,
            amount_claimed: 4000,
            coupon_code: couponCode,
          },
          screenshot: screenshotStub(sha(`coupon-submit-${stamp}`)),
        });
        assert.equal(submit.status, 'pending_review');

        const [[row]] = await mysqlPool.query(
          `SELECT * FROM manual_payments WHERE order_id = ? ORDER BY id DESC LIMIT 1`,
          [order.orderId]
        );
        createdPaymentIds.push(Number(row.id));
        assert.equal(Number(row.coupon_id) > 0, true);
        assert.equal(Number(row.discount_applied), 1000);
        assert.equal(Number(row.original_amount), 5000);
        assert.equal(Number(row.amount_claimed), 4000);
        assert.equal(parseRiskFlagsJson(row.risk_flags).includes('amount_mismatch'), false);

        const [[after]] = await mysqlPool.query(`SELECT used_count FROM coupons WHERE code = ?`, [couponCode]);
        assert.equal(Number(after.used_count), Number(before.used_count) + 1);
      });
    }

    const raceCode = `RC${stamp}`;
    await createTestCoupon({ code: raceCode, courseId, adminUserId: adminId, usageLimit: 1 });
    const raceOrderA = await createPendingOrderForUser(studentA, courseId, 5000, `${stamp}RA`);
    const raceOrderB = await createPendingOrderForUser(studentB, courseId, 5000, `${stamp}RB`);

    if (raceOrderA && raceOrderB) {
      await testAsync('last coupon slot race — exactly one submit succeeds', async () => {
        const results = await Promise.allSettled([
          submitManualPayment({
            studentId: studentA,
            orderId: raceOrderA.orderId,
            body: {
              payment_method: 'easypaisa',
              sender_phone_number: '03001234567',
              sender_account_title: 'Race A',
              transaction_id: `RCA${stamp}`,
              amount_claimed: 4000,
              coupon_code: raceCode,
            },
            screenshot: screenshotStub(sha(`race-a-${stamp}`)),
          }),
          submitManualPayment({
            studentId: studentB,
            orderId: raceOrderB.orderId,
            body: {
              payment_method: 'easypaisa',
              sender_phone_number: '03009998877',
              sender_account_title: 'Race B',
              transaction_id: `RCB${stamp}`,
              amount_claimed: 4000,
              coupon_code: raceCode,
            },
            screenshot: screenshotStub(sha(`race-b-${stamp}`)),
          }),
        ]);

        const successes = results.filter((r) => r.status === 'fulfilled');
        const failures = results.filter((r) => r.status === 'rejected');
        assert.equal(successes.length, 1);
        assert.equal(failures.length, 1);
        const failErr = failures[0].reason;
        assert.ok(failErr instanceof ApiError);
        assert.equal(failErr.message, COUPON_VALIDATION_MESSAGES.USAGE_LIMIT);

        const [[couponRow]] = await mysqlPool.query(`SELECT used_count FROM coupons WHERE code = ?`, [raceCode]);
        assert.equal(Number(couponRow.used_count), 1);

        for (const orderId of [raceOrderA.orderId, raceOrderB.orderId]) {
          const [[row]] = await mysqlPool.query(
            `SELECT id FROM manual_payments WHERE order_id = ? ORDER BY id DESC LIMIT 1`,
            [orderId]
          );
          if (row?.id) createdPaymentIds.push(Number(row.id));
        }
      });
    }
  }
} catch (err) {
  console.error('  ✗ database integration block');
  console.error(`    ${err.message}`);
} finally {
  try {
    await deleteManualPaymentsForTests(createdPaymentIds);
    if (createdCouponIds.length) {
      await mysqlPool.query(`DELETE FROM coupons WHERE id IN (?)`, [createdCouponIds]);
    }
    if (createdOrderIds.length) {
      await mysqlPool.query(`DELETE FROM orders WHERE id IN (?)`, [createdOrderIds]);
    }
    if (createdEnrollmentIds.length) {
      await mysqlPool.query(`DELETE FROM enrollments WHERE id IN (?)`, [createdEnrollmentIds]);
    }
    await mysqlPool.end().catch(() => {});
  } catch (cleanupErr) {
    console.error(`  ⚠ cleanup: ${cleanupErr.message}`);
  }
}

summary('manual-payment-coupon');
