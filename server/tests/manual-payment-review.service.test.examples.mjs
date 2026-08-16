/**
 * Admin manual payment review — approve/reject, concurrency, access grant.
 * Run: node tests/manual-payment-review.service.test.examples.mjs
 */

import { ApiError } from '../src/utils/apiError.js';
import { mysqlPool, verifyMySqlConnection } from '../src/config/mysql.js';
import { ensureManualPaymentsSchema } from '../src/db/ensureManualPaymentsSchema.js';
import { assertManualPaymentReviewerRole } from '../src/utils/manualPaymentReviewAccess.js';
import { parseRejectManualPaymentBody } from '../src/validators/manualPaymentReview.schema.js';
import { putApproveManualPaymentSubmission } from '../src/controllers/manualPaymentReview.controller.js';
import {
  approveManualPaymentSubmission,
  rejectManualPaymentSubmission,
} from '../src/services/manualPaymentReview.service.js';
import {
  deleteManualPaymentsForTests,
  insertManualPaymentForTests,
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

async function expectApiErrorAsync(label, fn, expectedStatus, expectedCode) {
  try {
    await fn();
    failed += 1;
    console.error(`  ✗ ${label} (no error thrown)`);
    return null;
  } catch (err) {
    const statusOk = err instanceof ApiError && err.statusCode === expectedStatus;
    const codeOk = !expectedCode || err.code === expectedCode || err.details?.code === expectedCode;
    if (statusOk && codeOk) {
      passed += 1;
      console.log(`  ✓ ${label}`);
      return err;
    }
    failed += 1;
    console.error(`  ✗ ${label}`);
    console.error(`    expected ApiError ${expectedStatus} ${expectedCode || ''}, got`, err);
    return err;
  }
}

async function waitForActivityLog(action, entityId, { attempts = 10, delayMs = 50 } = {}) {
  for (let i = 0; i < attempts; i += 1) {
    const [rows] = await mysqlPool.query(
      `SELECT action, entity_id, metadata_json
       FROM activity_logs
       WHERE action = ? AND entity_id = ?
       ORDER BY id DESC
       LIMIT 1`,
      [action, String(entityId)]
    );
    if (rows[0]) return rows[0];
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return null;
}

console.log('manual-payment-review — role + validation\n');

await expectApiErrorAsync(
  'teacher role blocked from approve/reject',
  async () => {
    assertManualPaymentReviewerRole('teacher');
  },
  403,
  'MANUAL_PAYMENT_REVIEW_FORBIDDEN'
);

await expectApiErrorAsync(
  'student role blocked from approve/reject',
  async () => {
    assertManualPaymentReviewerRole('student');
  },
  403,
  'MANUAL_PAYMENT_REVIEW_FORBIDDEN'
);

try {
  assertManualPaymentReviewerRole('admin');
  ok('regular admin allowed', true);
} catch {
  ok('regular admin allowed', false);
}

try {
  assertManualPaymentReviewerRole('super_admin');
  ok('super_admin allowed', true);
} catch {
  ok('super_admin allowed', false);
}

await expectApiErrorAsync(
  'reject without reason is a validation error',
  async () => {
    parseRejectManualPaymentBody({});
  },
  400,
  'REJECTION_REASON_REQUIRED'
);

await expectApiErrorAsync(
  'reject with blank reason is a validation error',
  async () => {
    parseRejectManualPaymentBody({ admin_note: '  ' });
  },
  400,
  'REJECTION_REASON_REQUIRED'
);

function invokeHandler(handler, req) {
  return new Promise((resolve, reject) => {
    const res = {
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        this.body = body;
        resolve({ status: this.statusCode || 200, body });
        return this;
      },
    };
    handler(req, res, (err) => (err ? reject(err) : resolve({ status: res.statusCode || 200, body: res.body })));
  });
}

await expectApiErrorAsync(
  'teacher calling approve endpoint handler is blocked',
  () =>
    invokeHandler(putApproveManualPaymentSubmission, {
      user: { id: 1, role: 'teacher' },
      params: { id: '1' },
    }),
  403,
  'MANUAL_PAYMENT_REVIEW_FORBIDDEN'
);

await expectApiErrorAsync(
  'student calling approve endpoint handler is blocked',
  () =>
    invokeHandler(putApproveManualPaymentSubmission, {
      user: { id: 1, role: 'student' },
      params: { id: '1' },
    }),
  403,
  'MANUAL_PAYMENT_REVIEW_FORBIDDEN'
);

console.log('\nmanual-payment-review — database integration\n');

const createdEnrollmentIds = [];
const createdOrderIds = [];
const createdPaymentIds = [];
const touchedEnrollmentIds = [];

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
    const name = String(col.name);
    if (name === 'user_id') return userId;
    if (name === 'course_id') return Number(course.id);
    if (name === 'order_id') return null;
    if (name === 'email') return `mp-review-${stamp}-${userId}@example.test`;
    if (name === 'status') return 'pending';
    if (name === 'access_status') return 'inactive';
    if (name === 'enrollment_source') return 'paid';
    if (
      name === 'admin_note' ||
      name === 'reviewed_by' ||
      name === 'reviewed_at' ||
      name === 'switch_confirmed_at'
    ) {
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
  await mysqlPool.query(`UPDATE enrollments SET order_id = ? WHERE id = ?`, [orderId, enrollmentId]);
  return { orderId, enrollmentId, courseId: Number(course.id), amount: 5000, userId };
}

async function seedPending(order, trx) {
  const id = await insertManualPaymentForTests({
    orderId: order.orderId,
    enrollmentId: order.enrollmentId,
    studentId: order.userId,
    paymentMethod: 'easypaisa',
    senderPhone: '03001234567',
    senderTitle: 'Review Seed',
    transactionId: trx,
    amountClaimed: order.amount,
    status: 'pending_review',
    riskLevel: 'low',
  });
  createdPaymentIds.push(id);
  return id;
}

try {
  await verifyMySqlConnection();
  await ensureManualPaymentsSchema(mysqlPool);

  const [[adminRow]] = await mysqlPool.query(
    `SELECT id, role FROM users WHERE role IN ('admin', 'super_admin') ORDER BY role = 'admin' DESC, id ASC LIMIT 1`
  );
  const [[studentRow]] = await mysqlPool.query(
    `SELECT u.id
     FROM users u
     WHERE u.role = 'student'
       AND NOT EXISTS (
         SELECT 1 FROM enrollments e
         WHERE e.user_id = u.id AND e.access_status = 'active'
       )
     ORDER BY (
       SELECT COUNT(*) FROM enrollments e2 WHERE e2.user_id = u.id
     ) ASC, u.id ASC
     LIMIT 1`
  );
  const [[anyStudent]] = await mysqlPool.query(
    `SELECT id FROM users WHERE role = 'student' ORDER BY id ASC LIMIT 1`
  );
  const [otherStudents] = await mysqlPool.query(
    `SELECT u.id
     FROM users u
     WHERE u.role = 'student'
       AND NOT EXISTS (
         SELECT 1 FROM enrollments e
         WHERE e.user_id = u.id AND e.access_status = 'active'
       )
     ORDER BY (
       SELECT COUNT(*) FROM enrollments e2 WHERE e2.user_id = u.id
     ) ASC, u.id ASC
     LIMIT 2`
  );

  const adminId = adminRow ? Number(adminRow.id) : null;
  const studentId = studentRow ? Number(studentRow.id) : anyStudent ? Number(anyStudent.id) : null;
  const secondStudentId =
    otherStudents.map((row) => Number(row.id)).find((id) => id !== studentId) ?? null;
  const stamp = `${Date.now()}`.slice(-8);

  if (!adminId || !studentId) {
    console.log('  ⚠ skipped DB integration — need an admin user and a student user');
  } else {
    const rejectOrder = await createPendingOrderForUser(studentId, `${stamp}R`);
    if (rejectOrder) {
      const rejectId = await seedPending(rejectOrder, `REJ${stamp}TRX`);

      await expectApiErrorAsync(
        'reject without reason via service is blocked',
        () =>
          rejectManualPaymentSubmission({
            submissionId: rejectId,
            actorId: adminId,
            actorRole: 'admin',
            adminNote: '',
          }),
        400,
        'REJECTION_REASON_REQUIRED'
      );

      const [[stillPending]] = await mysqlPool.query(
        `SELECT status FROM manual_payments WHERE id = ?`,
        [rejectId]
      );
      ok('reject without reason leaves row pending_review', String(stillPending.status) === 'pending_review');

      const rejected = await rejectManualPaymentSubmission({
        submissionId: rejectId,
        actorId: adminId,
        actorRole: 'admin',
        adminNote: 'Screenshot does not show the transfer.',
      });
      ok('reject with reason sets rejected', rejected.status === 'rejected');
      ok('rejected order stays pending for resubmit', rejected.orderStatus === 'pending');

      await expectApiErrorAsync(
        'approve on a rejected submission is already processed',
        () =>
          approveManualPaymentSubmission({
            submissionId: rejectId,
            actorId: adminId,
            actorRole: 'admin',
          }),
        409,
        'SUBMISSION_ALREADY_PROCESSED'
      );
    }

    if (!studentRow) {
      console.log('  ⚠ skipped approve/activation — no student without an active enrollment');
    } else {
      const approveOrder = await createPendingOrderForUser(studentId, `${stamp}A`);
      const raceOrder = await createPendingOrderForUser(studentId, `${stamp}C`);

      if (approveOrder) {
        const approveId = await seedPending(approveOrder, `APP${stamp}TRX`);
        touchedEnrollmentIds.push(approveOrder.enrollmentId);

        const approved = await approveManualPaymentSubmission({
          submissionId: approveId,
          actorId: adminId,
          actorRole: 'admin',
        });
        ok('approve returns approved status', approved.status === 'approved');

        const [[enroll]] = await mysqlPool.query(
          `SELECT access_status, status, enrollment_source FROM enrollments WHERE id = ?`,
          [approveOrder.enrollmentId]
        );
        ok(
          'approve activates enrollment access_status',
          String(enroll.access_status) === 'active'
        );
        ok('approve sets enrollment status approved', String(enroll.status) === 'approved');
        ok('approve stamps enrollment_source paid', String(enroll.enrollment_source) === 'paid');

        const [[orderRow]] = await mysqlPool.query(`SELECT status FROM orders WHERE id = ?`, [
          approveOrder.orderId,
        ]);
        ok('approve marks order paid', String(orderRow.status) === 'paid');

        await expectApiErrorAsync(
          'second approve on same submission is already processed',
          () =>
            approveManualPaymentSubmission({
              submissionId: approveId,
              actorId: adminId,
              actorRole: 'admin',
            }),
          409,
          'SUBMISSION_ALREADY_PROCESSED'
        );

        await mysqlPool.query(
          `UPDATE enrollments SET access_status = 'inactive' WHERE id = ?`,
          [approveOrder.enrollmentId]
        );
      }

      if (raceOrder) {
        const raceId = await seedPending(raceOrder, `RAC${stamp}TRX`);
        touchedEnrollmentIds.push(raceOrder.enrollmentId);

        const results = await Promise.allSettled([
          approveManualPaymentSubmission({
            submissionId: raceId,
            actorId: adminId,
            actorRole: 'admin',
          }),
          approveManualPaymentSubmission({
            submissionId: raceId,
            actorId: adminId,
            actorRole: 'admin',
          }),
        ]);

        const fulfilled = results.filter((r) => r.status === 'fulfilled');
        const rejected = results.filter((r) => r.status === 'rejected');
        ok('concurrent approve: exactly one succeeds', fulfilled.length === 1);
        ok(
          'concurrent approve: loser is already-processed 409',
          rejected.length === 1
            && rejected[0].reason instanceof ApiError
            && rejected[0].reason.statusCode === 409
            && (rejected[0].reason.code === 'SUBMISSION_ALREADY_PROCESSED'
              || rejected[0].reason.details?.code === 'SUBMISSION_ALREADY_PROCESSED')
        );

        const [[enrollRace]] = await mysqlPool.query(
          `SELECT access_status FROM enrollments WHERE id = ?`,
          [raceOrder.enrollmentId]
        );
        const [[payCount]] = await mysqlPool.query(
          `SELECT COUNT(*) AS n FROM manual_payments WHERE id = ? AND status = 'approved'`,
          [raceId]
        );
        ok('concurrent approve does not double-activate', String(enrollRace.access_status) === 'active');
        ok('concurrent approve leaves a single approved row', Number(payCount.n) === 1);

        await mysqlPool.query(`UPDATE enrollments SET access_status = 'inactive' WHERE id = ?`, [
          raceOrder.enrollmentId,
        ]);
      }

      console.log('\nmanual-payment-review — H4 duplicate transaction_id at approve\n');

      if (secondStudentId) {
        const dupTrx = `DUP${stamp}SHARED`;
        const dupOrderA = await createPendingOrderForUser(studentId, `${stamp}D1`);
        const dupOrderB = await createPendingOrderForUser(secondStudentId, `${stamp}D2`);

        if (dupOrderA && dupOrderB) {
          const dupIdA = await seedPending(dupOrderA, dupTrx);
          const dupIdB = await seedPending(dupOrderB, dupTrx);
          touchedEnrollmentIds.push(dupOrderA.enrollmentId, dupOrderB.enrollmentId);

          const dupApproved = await approveManualPaymentSubmission({
            submissionId: dupIdA,
            actorId: adminId,
            actorRole: 'admin',
          });
          ok('duplicate TRX: first approve succeeds', dupApproved.status === 'approved');

          const dupRejectErr = await expectApiErrorAsync(
            'duplicate TRX: second approve rejected cleanly',
            () =>
              approveManualPaymentSubmission({
                submissionId: dupIdB,
                actorId: adminId,
                actorRole: 'admin',
              }),
            409,
            'TRANSACTION_ID_ALREADY_APPROVED_ELSEWHERE'
          );
          ok(
            'duplicate TRX: error message is specific',
            dupRejectErr instanceof ApiError
              && dupRejectErr.message.includes('already been approved on another submission')
          );
          console.log(
            `    duplicate TRX reject → status=${dupRejectErr?.statusCode} code=${dupRejectErr?.code} message="${dupRejectErr?.message}"`
          );

          const [[dupRowB]] = await mysqlPool.query(
            `SELECT status FROM manual_payments WHERE id = ?`,
            [dupIdB]
          );
          ok('duplicate TRX: second row stays pending_review', String(dupRowB.status) === 'pending_review');

          const [[dupEnrollB]] = await mysqlPool.query(
            `SELECT access_status FROM enrollments WHERE id = ?`,
            [dupOrderB.enrollmentId]
          );
          ok('duplicate TRX: second enrollment not activated', String(dupEnrollB.access_status) !== 'active');

          await mysqlPool.query(`UPDATE enrollments SET access_status = 'inactive' WHERE id = ?`, [
            dupOrderA.enrollmentId,
          ]);

          const raceTrx = `DUPRACE${stamp}SHARED`;
          const raceDupA = await createPendingOrderForUser(studentId, `${stamp}DR1`);
          const raceDupB = await createPendingOrderForUser(secondStudentId, `${stamp}DR2`);
          if (raceDupA && raceDupB) {
              const raceDupIdA = await seedPending(raceDupA, raceTrx);
              const raceDupIdB = await seedPending(raceDupB, raceTrx);
              touchedEnrollmentIds.push(raceDupA.enrollmentId, raceDupB.enrollmentId);

              await mysqlPool.query(`UPDATE enrollments SET access_status = 'inactive' WHERE id = ?`, [
                dupOrderA.enrollmentId,
              ]);

              const raceResults = await Promise.allSettled([
                approveManualPaymentSubmission({
                  submissionId: raceDupIdA,
                  actorId: adminId,
                  actorRole: 'admin',
                }),
                approveManualPaymentSubmission({
                  submissionId: raceDupIdB,
                  actorId: adminId,
                  actorRole: 'admin',
                }),
              ]);

              const raceFulfilled = raceResults.filter((r) => r.status === 'fulfilled');
              const raceRejected = raceResults.filter((r) => r.status === 'rejected');
              ok('duplicate TRX race: exactly one approve succeeds', raceFulfilled.length === 1);
              const raceLoserErr = raceRejected[0]?.reason;
              if (!(raceLoserErr instanceof ApiError)) {
                console.error('    duplicate TRX race loser (non-ApiError):', raceLoserErr);
              } else {
                console.log(
                  `    duplicate TRX race reject → status=${raceLoserErr.statusCode} code=${raceLoserErr.code} message="${raceLoserErr.message}"`
                );
              }
              ok(
                'duplicate TRX race: loser is duplicate-TRX 409',
                raceRejected.length === 1
                  && raceLoserErr instanceof ApiError
                  && raceLoserErr.statusCode === 409
                  && raceLoserErr.code === 'TRANSACTION_ID_ALREADY_APPROVED_ELSEWHERE'
              );

              const [[approvedRaceCount]] = await mysqlPool.query(
                `SELECT COUNT(*) AS n FROM manual_payments WHERE transaction_id = ? AND status = 'approved'`,
                [raceTrx]
              );
              ok('duplicate TRX race: only one approved row for shared TRX', Number(approvedRaceCount.n) === 1);

              await mysqlPool.query(`UPDATE enrollments SET access_status = 'inactive' WHERE id IN (?)`, [
                [raceDupA.enrollmentId, raceDupB.enrollmentId],
              ]);
            }
        } else {
          console.log('  ⚠ skipped duplicate TRX test — could not create two pending orders');
        }
      } else {
        console.log('  ⚠ skipped duplicate TRX test — need two distinct student users');
      }

      console.log('\nmanual-payment-review — H5 submission/order integrity\n');

      const integrityStudentId = secondStudentId ?? studentId;
      const integrityOrder = await createPendingOrderForUser(integrityStudentId, `${stamp}H5`);
      if (integrityOrder) {
        const integrityId = await seedPending(integrityOrder, `H5${stamp}TRX`);
        touchedEnrollmentIds.push(integrityOrder.enrollmentId);

        const [[wrongStudent]] = await mysqlPool.query(
          `SELECT id FROM users WHERE role = 'student' AND id <> ? ORDER BY id ASC LIMIT 1`,
          [integrityStudentId]
        );
        const tamperedStudentId = wrongStudent ? Number(wrongStudent.id) : adminId;

        await mysqlPool.query(`UPDATE manual_payments SET student_id = ? WHERE id = ?`, [
          tamperedStudentId,
          integrityId,
        ]);

        const mismatchErr = await expectApiErrorAsync(
          'H5: tampered student_id blocked at approve',
          () =>
            approveManualPaymentSubmission({
              submissionId: integrityId,
              actorId: adminId,
              actorRole: 'admin',
            }),
          409,
          'MANUAL_PAYMENT_ORDER_MISMATCH'
        );
        ok(
          'H5: mismatch error message is specific',
          mismatchErr instanceof ApiError
            && mismatchErr.message.includes('does not match the order owner')
        );
        console.log(
          `    H5 mismatch reject → status=${mismatchErr?.statusCode} code=${mismatchErr?.code} reason=${mismatchErr?.details?.reason} message="${mismatchErr?.message}"`
        );

        const [[integrityRow]] = await mysqlPool.query(
          `SELECT status FROM manual_payments WHERE id = ?`,
          [integrityId]
        );
        ok('H5: tampered row stays pending_review', String(integrityRow.status) === 'pending_review');

        const [[integrityOrderRow]] = await mysqlPool.query(
          `SELECT status FROM orders WHERE id = ?`,
          [integrityOrder.orderId]
        );
        ok('H5: order stays pending after blocked approve', String(integrityOrderRow.status) === 'pending');

        const activityRow = await waitForActivityLog(
          'admin.manual_payment.order_mismatch_blocked',
          integrityId
        );
        ok('H5: activity_log records order_mismatch_blocked', Boolean(activityRow));
        if (activityRow) {
          const metadata =
            typeof activityRow.metadata_json === 'string'
              ? JSON.parse(activityRow.metadata_json)
              : activityRow.metadata_json || {};
          ok('H5: activity_log metadata includes reason', metadata.reason === 'student_id_mismatch');
          console.log(`    H5 activity_log action=${activityRow.action} reason=${metadata.reason}`);
        }
      }
    }
  }
} catch (err) {
  failed += 1;
  console.error('  ✗ database integration block');
  console.error(`    ${err.message}`);
  if (err.stack) console.error(err.stack.split('\n').slice(0, 8).join('\n'));
} finally {
  try {
    if (touchedEnrollmentIds.length) {
      await mysqlPool.query(
        `UPDATE enrollments SET access_status = 'inactive', order_id = NULL WHERE id IN (?)`,
        [touchedEnrollmentIds]
      );
    }
    await deleteManualPaymentsForTests(createdPaymentIds);
    if (createdEnrollmentIds.length) {
      await mysqlPool.query(`UPDATE enrollments SET order_id = NULL WHERE id IN (?)`, [
        createdEnrollmentIds,
      ]);
    }
    if (createdOrderIds.length) {
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
