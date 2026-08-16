/**
 * Verifies activateEnrollmentInTransaction bind order against the live DB row.
 * Run: node tests/enrollment-lifecycle-activation-binds.test.examples.mjs
 */

import { mysqlPool, verifyMySqlConnection } from '../src/config/mysql.js';
import { ENROLLMENT_SOURCE } from '../src/constants/enrollmentSource.js';
import { activateEnrollmentInTransaction } from '../src/services/enrollmentLifecycle.service.js';
import { markOrderPaidFromPending } from '../src/services/orderCheckoutIntegrity.service.js';

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

const createdEnrollmentIds = [];
const createdOrderIds = [];
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
    if (name === 'email') return `lc-bind-${stamp}-${userId}@example.test`;
    if (name === 'status') return 'pending';
    if (name === 'access_status') return 'inactive';
    if (name === 'enrollment_source') return null;
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
     VALUES (?, ?, ?, 'safepay', 5000, 'PKR', 'pending')`,
    [userId, Number(course.id), enrollmentId]
  );
  const orderId = Number(orderResult.insertId);
  createdOrderIds.push(orderId);
  await mysqlPool.query(`UPDATE enrollments SET order_id = ? WHERE id = ?`, [orderId, enrollmentId]);
  return { orderId, enrollmentId, courseId: Number(course.id), userId };
}

console.log('enrollment-lifecycle — activation bind order (live DB)\n');

try {
  await verifyMySqlConnection();

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

  if (!studentRow) {
    console.log('  ⚠ skipped — no student without an active enrollment');
  } else {
    const studentId = Number(studentRow.id);
    const stamp = `${Date.now()}`.slice(-8);
    const fixture = await createPendingOrderForUser(studentId, stamp);

    if (!fixture) {
      console.log('  ⚠ skipped — could not allocate a free course for the student');
    } else {
      touchedEnrollmentIds.push(fixture.enrollmentId);
      const connection = await mysqlPool.getConnection();
      try {
        await connection.beginTransaction();

        const paidRows = await markOrderPaidFromPending(connection, {
          orderId: fixture.orderId,
          gatewayRefForDb: `bindfix:${fixture.orderId}`.slice(0, 120),
          safepayTxnForDb: `TXN${stamp}`,
          rawTrackerSlice: '',
          payloadJsonStr: JSON.stringify({ source: 'bind_order_test' }),
        });
        ok('order marked paid before Safepay-shaped activation', paidRows === 1);

        // Exact options object used by payments.service.js webhook (actor/reason included).
        await activateEnrollmentInTransaction(connection, {
          enrollmentId: fixture.enrollmentId,
          orderId: fixture.orderId,
          actor: 'payment.webhook',
          reason: 'safepay_paid',
          requirePaidOrder: true,
          enrollmentSource: ENROLLMENT_SOURCE.PAID,
        });

        await connection.commit();
      } catch (error) {
        try {
          await connection.rollback();
        } catch {
          /* ignore */
        }
        throw error;
      } finally {
        connection.release();
      }

      const [[row]] = await mysqlPool.query(
        `SELECT enrollment_source, order_id, access_status, status
         FROM enrollments WHERE id = ?`,
        [fixture.enrollmentId]
      );

      ok('Safepay-shaped activation stores enrollment_source as paid', String(row.enrollment_source) === 'paid');
      ok(
        'Safepay-shaped activation stores numeric order_id (not swapped with source)',
        Number(row.order_id) === fixture.orderId
      );
      ok('Safepay-shaped activation sets access_status active', String(row.access_status) === 'active');
      ok('Safepay-shaped activation sets status approved', String(row.status) === 'approved');
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
        `UPDATE enrollments SET access_status = 'inactive', order_id = NULL, enrollment_source = NULL WHERE id IN (?)`,
        [touchedEnrollmentIds]
      );
    }
    if (createdEnrollmentIds.length) {
      await mysqlPool.query(`UPDATE enrollments SET order_id = NULL WHERE id IN (?)`, [createdEnrollmentIds]);
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
