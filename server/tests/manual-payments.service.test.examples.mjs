/**
 * Manual payments — fraud checks, student serializer leak, rate limit.
 * Run: node tests/manual-payments.service.test.examples.mjs
 */

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ApiError } from '../src/utils/apiError.js';
import { mysqlPool, verifyMySqlConnection } from '../src/config/mysql.js';
import { ensureManualPaymentsSchema } from '../src/db/ensureManualPaymentsSchema.js';
import { resetSlidingWindowMemoryForTests } from '../src/services/slidingWindowRateLimit.service.js';
import { manualPaymentSubmitRateLimit } from '../src/middleware/manualPaymentSubmitRateLimit.js';
import {
  computeManualPaymentRisk,
  MANUAL_PAYMENT_RISK_FLAGS,
  parseRiskFlagsJson,
  toStudentManualPaymentView,
  assertNoRiskLeak,
} from '../src/services/manualPaymentRisk.service.js';
import { hashUploadedFileSha256 } from '../src/services/manualPaymentScreenshotUpload.service.js';
import { parseSubmitManualPaymentFields } from '../src/validators/manualPayment.schema.js';
import {
  deleteManualPaymentsForTests,
  getManualPaymentRowForTests,
  getManualPaymentStatus,
  insertManualPaymentForTests,
  submitManualPayment,
} from '../src/services/manualPayments.service.js';

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

async function asyncTest(label, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${label}`);
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${label}`);
    if (err?.message) console.error(`    ${err.message}`);
  }
}

async function expectApiErrorAsync(label, fn, expectedStatus, expectedCode) {
  try {
    await fn();
    failed += 1;
    console.error(`  ✗ ${label} (no error thrown)`);
  } catch (err) {
    const statusOk = err instanceof ApiError && err.statusCode === expectedStatus;
    const codeOk = expectedCode ? err.code === expectedCode || err.details?.code === expectedCode : true;
    if (statusOk && codeOk) {
      passed += 1;
      console.log(`  ✓ ${label}`);
    } else {
      failed += 1;
      console.error(`  ✗ ${label}`);
      console.error(`    expected ApiError ${expectedStatus}${expectedCode ? ` ${expectedCode}` : ''}, got`, err);
    }
  }
}

function flagsOf(row) {
  return parseRiskFlagsJson(row?.risk_flags);
}

function sha(text) {
  return createHash('sha256').update(String(text)).digest('hex');
}

function mockRateLimitRes() {
  return {
    headers: {},
    setHeader(name, value) {
      this.headers[name] = value;
    },
  };
}

async function invokeRateLimit(userId, orderId) {
  const req = { user: { id: userId }, params: { orderId: String(orderId) } };
  const res = mockRateLimitRes();
  let nextErr;
  await new Promise((resolve) => {
    manualPaymentSubmitRateLimit(req, res, (err) => {
      nextErr = err;
      resolve();
    });
  });
  return { nextErr, res };
}

console.log('manual-payments — validation + risk (no DB)\n');

{
  const parsed = parseSubmitManualPaymentFields({
    payment_method: 'easypaisa',
    sender_phone_number: '+923001234567',
    sender_account_title: '  Ali Khan  ',
    transaction_id: ' jc-abc-001 ',
    amount_claimed: '5000',
  });
  ok('normalizes phone, title, trx id', parsed.sender_phone_number === '03001234567'
    && parsed.sender_account_title === 'Ali Khan'
    && parsed.transaction_id === 'JC-ABC-001'
    && parsed.amount_claimed === 5000);
}

await asyncTest('invalid transaction id rejected', async () => {
  try {
    parseSubmitManualPaymentFields({
      payment_method: 'easypaisa',
      sender_phone_number: '03001234567',
      sender_account_title: 'Ali Khan',
      transaction_id: 'ab',
      amount_claimed: 5000,
    });
    throw new Error('expected validation error');
  } catch (err) {
    assert.equal(err.statusCode, 400);
  }
});

{
  const risk = computeManualPaymentRisk({
    studentId: 2,
    amountClaimed: 4900,
    expectedAmount: 5000,
    pendingTrxMatches: [{ studentId: 1 }],
    screenshotMatches: [{ studentId: 1, status: 'pending_review' }],
    recentDifferentTrxCount: 1,
    priorSenderNumbers: ['03001111111'],
    senderPhone: '03002222222',
  });
  ok(
    'all fraud signals set needs_review',
    risk.riskLevel === 'needs_review'
      && risk.flags.includes(MANUAL_PAYMENT_RISK_FLAGS.DUPLICATE_TRANSACTION_ID_PENDING)
      && risk.flags.includes(MANUAL_PAYMENT_RISK_FLAGS.DUPLICATE_SCREENSHOT_HASH)
      && risk.flags.includes(MANUAL_PAYMENT_RISK_FLAGS.DUPLICATE_SCREENSHOT_DIFFERENT_STUDENT)
      && risk.flags.includes(MANUAL_PAYMENT_RISK_FLAGS.AMOUNT_MISMATCH)
      && risk.flags.includes(MANUAL_PAYMENT_RISK_FLAGS.HIGH_VELOCITY)
      && risk.flags.includes(MANUAL_PAYMENT_RISK_FLAGS.SENDER_NUMBER_CHANGED)
  );
}

{
  const risk = computeManualPaymentRisk({
    studentId: 1,
    amountClaimed: 5000,
    expectedAmount: 5000,
    pendingTrxMatches: [],
    screenshotMatches: [{ studentId: 1, status: 'rejected' }],
    recentDifferentTrxCount: 0,
    priorSenderNumbers: ['03001234567'],
    senderPhone: '03001234567',
  });
  ok('clean submit stays low and ignores rejected screenshot', risk.riskLevel === 'low' && risk.flags.length === 0);
}

{
  const row = {
    status: 'pending_review',
    transaction_id: 'ABC123',
    amount_claimed: 5000,
    payment_method: 'easypaisa',
    sender_phone_number: '03001234567',
    sender_account_title: 'Ali Khan',
    created_at: '2026-08-14T00:00:00.000Z',
    admin_note: 'internal',
    risk_flags: ['duplicate_screenshot_hash'],
    risk_level: 'needs_review',
    screenshot_file_hash: 'abc',
    screenshot_url: '/api/uploads/manual-payments/0123456789abcdef0123456789abcdef0123456789abcdef.jpg',
    receiver_method: 'easypaisa',
    receiver_account_number: '03001234567',
    receiver_account_title: 'MRB Classes',
  };
  const { enrichStudentSubmissionView } = await import('../src/services/manualPayments.service.js');
  const view = enrichStudentSubmissionView(row, 42);
  const envelope = { success: true, data: view };
  try {
    assertNoRiskLeak(envelope);
    assert.equal(view.status, 'pending_review');
    assert.equal(view.adminNote, null);
    assert.equal(view.senderPhoneNumber, '03001234567');
    assert.equal(view.receiverAccount.accountNumber, '03001234567');
    assert.equal(view.screenshotUrl, '/api/payments/manual/42/screenshot');
    assert.equal('risk_flags' in view, false);
    assert.equal('risk_level' in view, false);
    ok('student view omits risk intelligence', true);
  } catch (err) {
    ok(`student view omits risk intelligence (${err.message})`, false);
  }
  ok(
    'student JSON string has no risk keys',
    !JSON.stringify(envelope).includes('risk_flags')
      && !JSON.stringify(envelope).includes('risk_level')
      && !JSON.stringify(envelope).includes('screenshot_file_hash')
  );
}

await asyncTest('SHA-256 is of original file bytes', async () => {
  const tmp = path.join(os.tmpdir(), `mp-hash-${Date.now()}.bin`);
  const bytes = Buffer.from('manual-payment-original-bytes');
  await fs.writeFile(tmp, bytes);
  try {
    const got = await hashUploadedFileSha256(tmp);
    assert.equal(got, createHash('sha256').update(bytes).digest('hex'));
  } finally {
    await fs.unlink(tmp).catch(() => {});
  }
});

console.log('\nmanual-payments — 24h velocity rate limit\n');

resetSlidingWindowMemoryForTests();
const rateUserId = 2_147_000_000 + Math.floor(Math.random() * 9_000);

for (let i = 1; i <= 5; i += 1) {
  const { nextErr } = await invokeRateLimit(rateUserId, 1);
  ok(`attempt ${i} allowed`, !nextErr);
}

{
  const { nextErr, res } = await invokeRateLimit(rateUserId, 1);
  ok(
    '6th submission attempt within 24h returns 429',
    nextErr instanceof ApiError
      && nextErr.statusCode === 429
      && (nextErr.code === 'RATE_LIMITED' || nextErr.details?.code === 'RATE_LIMITED')
      && /24 hours/i.test(nextErr.message)
      && Boolean(res.headers['Retry-After'])
  );
}

console.log('\nmanual-payments — database integration\n');

const createdEnrollmentIds = [];
const createdOrderIds = [];
const createdPaymentIds = [];

async function insertableEnrollmentColumns() {
  const [cols] = await mysqlPool.query(
    `SELECT COLUMN_NAME AS name, EXTRA AS extra
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'enrollments'`
  );
  return cols.filter((col) => !String(col.extra || '').toUpperCase().includes('GENERATED') && col.name !== 'id');
}

async function createPendingOrderForUser(userId, stamp) {
  const [[template]] = await mysqlPool.query(`SELECT * FROM enrollments ORDER BY id DESC LIMIT 1`);
  if (!template) return null;

  const [courses] = await mysqlPool.query(`SELECT id FROM courses ORDER BY id ASC`);
  const [existing] = await mysqlPool.query(`SELECT course_id FROM enrollments WHERE user_id = ?`, [userId]);
  const taken = new Set(existing.map((row) => Number(row.course_id)));
  const course = courses.find((row) => !taken.has(Number(row.id)));
  if (!course) return null;

  const columns = await insertableEnrollmentColumns();
  const values = columns.map((col) => {
    const name = col.name;
    if (name === 'user_id') return userId;
    if (name === 'course_id') return Number(course.id);
    if (name === 'order_id') return null;
    if (name === 'email') return `mp-test-${stamp}-${userId}@example.test`;
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
     VALUES (?, ?, ?, 'manual', 5000, 'PKR', 'pending')`,
    [userId, Number(course.id), enrollmentId]
  );
  const orderId = Number(orderResult.insertId);
  createdOrderIds.push(orderId);
  return { orderId, enrollmentId, courseId: Number(course.id), amount: 5000, userId };
}

async function seedApprovedPayment(order, trx, hash) {
  const id = await insertManualPaymentForTests({
    orderId: order.orderId,
    enrollmentId: order.enrollmentId,
    studentId: order.userId,
    paymentMethod: 'easypaisa',
    senderPhone: '03001234567',
    senderTitle: 'Seed Approved',
    transactionId: trx,
    amountClaimed: order.amount,
    screenshotHash: hash,
    status: 'approved',
    riskLevel: 'low',
  });
  createdPaymentIds.push(id);
  return id;
}

async function seedPendingPayment(order, trx, hash, senderPhone = '03001234567') {
  const id = await insertManualPaymentForTests({
    orderId: order.orderId,
    enrollmentId: order.enrollmentId,
    studentId: order.userId,
    paymentMethod: 'easypaisa',
    senderPhone,
    senderTitle: 'Seed Pending',
    transactionId: trx,
    amountClaimed: order.amount,
    screenshotHash: hash,
    status: 'pending_review',
    riskLevel: 'low',
  });
  createdPaymentIds.push(id);
  return id;
}

function screenshotStub(hash) {
  return {
    url: `/api/uploads/manual-payments/${hash.slice(0, 16)}.png`,
    sha256: hash,
    storedPath: path.join(os.tmpdir(), `mp-missing-${hash.slice(0, 8)}`),
  };
}

function submitBody(overrides = {}) {
  return {
    payment_method: 'easypaisa',
    sender_phone_number: '03001234567',
    sender_account_title: 'Test Sender',
    transaction_id: 'PLACEHOLDER',
    amount_claimed: 5000,
    ...overrides,
  };
}

try {
  await verifyMySqlConnection();
  await ensureManualPaymentsSchema(mysqlPool);

  const [users] = await mysqlPool.query(
    `SELECT id FROM users WHERE role = 'student' ORDER BY id ASC LIMIT 2`
  );
  const studentA = users[0] ? Number(users[0].id) : null;
  const studentB = users[1] ? Number(users[1].id) : null;
  const stamp = `${Date.now()}`.slice(-8);

  if (!studentA || !studentB) {
    console.log('  ⚠ skipped DB integration — need two student users');
  } else {
    const orderA = await createPendingOrderForUser(studentA, `${stamp}A`);
    const orderB1 = await createPendingOrderForUser(studentB, `${stamp}B1`);
    const orderB2 = await createPendingOrderForUser(studentB, `${stamp}B2`);
    const orderB3 = await createPendingOrderForUser(studentB, `${stamp}B3`);

    if (!orderA || !orderB1 || !orderB2 || !orderB3) {
      console.log('  ⚠ skipped DB integration — could not create isolated pending orders');
    } else {
      const approvedTrx = `APPR${stamp}TRX1`;
      const pendingTrx = `PEND${stamp}TRX2`;
      const amountTrx = `AMNT${stamp}TRX3`;
      const shotTrx = `SHOT${stamp}TRX4`;
      const approvedHash = sha(`approved-${stamp}`);
      const pendingHash = sha(`pending-${stamp}`);
      const amountHash = sha(`amount-${stamp}`);
      const sharedShotHash = sha(`shared-shot-${stamp}`);

      await seedApprovedPayment(orderA, approvedTrx, approvedHash);

      const [[beforeApproved]] = await mysqlPool.query(
        `SELECT COUNT(*) AS n FROM manual_payments WHERE transaction_id = ?`,
        [approvedTrx]
      );

      await expectApiErrorAsync(
        'approved transaction_id reuse returns 409',
        () =>
          submitManualPayment({
            studentId: studentB,
            orderId: orderB1.orderId,
            body: submitBody({ transaction_id: approvedTrx }),
            screenshot: screenshotStub(sha(`new-${stamp}-1`)),
          }),
        409,
        'TRANSACTION_ID_ALREADY_VERIFIED'
      );

      const [[afterApproved]] = await mysqlPool.query(
        `SELECT COUNT(*) AS n FROM manual_payments WHERE transaction_id = ?`,
        [approvedTrx]
      );
      ok(
        'approved TRX reuse does not create a row',
        Number(beforeApproved.n) === 1 && Number(afterApproved.n) === 1
      );

      const pendingSeedId = await seedPendingPayment(orderA, pendingTrx, pendingHash);
      const pendingDup = await submitManualPayment({
        studentId: studentB,
        orderId: orderB1.orderId,
        body: submitBody({ transaction_id: pendingTrx }),
        screenshot: screenshotStub(sha(`new-${stamp}-pending`)),
      });
      const [[newPendingRow]] = await mysqlPool.query(
        `SELECT * FROM manual_payments WHERE order_id = ? ORDER BY id DESC LIMIT 1`,
        [orderB1.orderId]
      );
      createdPaymentIds.push(Number(newPendingRow.id));
      const oldPendingRow = await getManualPaymentRowForTests(pendingSeedId);
      ok(
        'pending TRX from another student is created',
        pendingDup.status === 'pending_review' && Number(newPendingRow?.student_id) === studentB
      );
      ok(
        'pending TRX duplicate sets duplicate_transaction_id_pending + needs_review',
        flagsOf(newPendingRow).includes(MANUAL_PAYMENT_RISK_FLAGS.DUPLICATE_TRANSACTION_ID_PENDING)
          && String(newPendingRow.risk_level) === 'needs_review'
      );
      ok(
        'existing pending row is also flagged for admin comparison',
        flagsOf(oldPendingRow).includes(MANUAL_PAYMENT_RISK_FLAGS.DUPLICATE_TRANSACTION_ID_PENDING)
          && String(oldPendingRow.risk_level) === 'needs_review'
      );

      await seedPendingPayment(orderA, `SEED${stamp}SHOT`, sharedShotHash);
      const shotSubmit = await submitManualPayment({
        studentId: studentB,
        orderId: orderB2.orderId,
        body: submitBody({ transaction_id: shotTrx }),
        screenshot: screenshotStub(sharedShotHash),
      });
      const [[shotRow]] = await mysqlPool.query(
        `SELECT * FROM manual_payments WHERE order_id = ? ORDER BY id DESC LIMIT 1`,
        [orderB2.orderId]
      );
      createdPaymentIds.push(Number(shotRow.id));
      ok('identical screenshot from another student still returns 201-style success payload', shotSubmit.status === 'pending_review');
      ok(
        'duplicate screenshot sets hash + different_student flags',
        flagsOf(shotRow).includes(MANUAL_PAYMENT_RISK_FLAGS.DUPLICATE_SCREENSHOT_HASH)
          && flagsOf(shotRow).includes(MANUAL_PAYMENT_RISK_FLAGS.DUPLICATE_SCREENSHOT_DIFFERENT_STUDENT)
          && String(shotRow.risk_level) === 'needs_review'
      );

      const mismatch = await submitManualPayment({
        studentId: studentB,
        orderId: orderB3.orderId,
        body: submitBody({ transaction_id: amountTrx, amount_claimed: 4990 }),
        screenshot: screenshotStub(amountHash),
      });
      const [[mismatchRow]] = await mysqlPool.query(
        `SELECT * FROM manual_payments WHERE order_id = ? ORDER BY id DESC LIMIT 1`,
        [orderB3.orderId]
      );
      createdPaymentIds.push(Number(mismatchRow.id));
      ok('amount mismatch is not blocked', mismatch.status === 'pending_review');
      ok(
        'amount mismatch is flagged needs_review',
        flagsOf(mismatchRow).includes(MANUAL_PAYMENT_RISK_FLAGS.AMOUNT_MISMATCH)
          && String(mismatchRow.risk_level) === 'needs_review'
      );

      const studentStatus = await getManualPaymentStatus({
        studentId: studentB,
        orderId: orderB3.orderId,
      });
      const statusJson = JSON.stringify({ success: true, data: studentStatus });
      try {
        assertNoRiskLeak(statusJson);
        ok(
          'student status JSON has no risk_flags/risk_level leak',
          !statusJson.includes('risk_flags')
            && !statusJson.includes('risk_level')
            && !statusJson.includes('screenshot_file_hash')
            && studentStatus.status === 'pending_review'
        );
      } catch (err) {
        ok(`student status JSON leak check (${err.message})`, false);
      }

      const submitJson = JSON.stringify({ success: true, data: mismatch });
      ok(
        'submit payload JSON has no risk leak',
        !submitJson.includes('risk_flags')
          && !submitJson.includes('risk_level')
          && !submitJson.includes('screenshot_file_hash')
      );
    }
  }
} catch (err) {
  failed += 1;
  console.error('  ✗ database integration block');
  console.error(`    ${err.message}`);
} finally {
  try {
    await deleteManualPaymentsForTests(createdPaymentIds);
    if (createdOrderIds.length) {
      await mysqlPool.query(`UPDATE enrollments SET order_id = NULL WHERE id IN (?)`, [createdEnrollmentIds]);
      await mysqlPool.query(`DELETE FROM orders WHERE id IN (?)`, [createdOrderIds]);
    }
    if (createdEnrollmentIds.length) {
      await mysqlPool.query(`DELETE FROM enrollments WHERE id IN (?)`, [createdEnrollmentIds]);
    }
  } catch (cleanupErr) {
    console.error(`  ⚠ cleanup: ${cleanupErr.message}`);
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
await mysqlPool.end().catch(() => {});
process.exit(failed > 0 ? 1 : 0);
