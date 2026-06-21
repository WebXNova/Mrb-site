#!/usr/bin/env node
/**
 * Pre-migration orphan analysis: orders.enrollment_id → enrollments.id
 * Run: node scripts/analyze-orders-enrollment-integrity.mjs
 */
import 'dotenv/config';
import { mysqlPool } from '../src/config/mysql.js';

async function main() {
  const [[{ db }]] = await mysqlPool.query('SELECT DATABASE() AS db');

  const [[totals]] = await mysqlPool.query(
    `SELECT
       COUNT(*) AS total_orders,
       SUM(enrollment_id IS NULL) AS orders_null_enrollment_id,
       SUM(enrollment_id IS NOT NULL) AS orders_with_enrollment_id
     FROM orders`
  );

  const [orphanOrders] = await mysqlPool.query(
    `SELECT o.id, o.user_id, o.course_id, o.enrollment_id, o.status, o.amount, o.currency,
            o.cancellation_reason, o.paid_at, o.created_at
     FROM orders o
     LEFT JOIN enrollments e ON e.id = o.enrollment_id
     WHERE o.enrollment_id IS NOT NULL AND e.id IS NULL
     ORDER BY o.id`
  );

  const [userMismatch] = await mysqlPool.query(
    `SELECT o.id AS order_id, o.user_id AS order_user_id, e.user_id AS enrollment_user_id,
            o.course_id AS order_course_id, e.course_id AS enrollment_course_id,
            o.status, o.enrollment_id
     FROM orders o
     INNER JOIN enrollments e ON e.id = o.enrollment_id
     WHERE o.user_id <> e.user_id OR o.course_id <> e.course_id
     ORDER BY o.id`
  );

  const [enrollmentOrderMismatch] = await mysqlPool.query(
    `SELECT o.id AS order_id, o.enrollment_id, o.status, o.amount,
            e.order_id AS enrollment_order_id, e.status AS enrollment_status
     FROM orders o
     INNER JOIN enrollments e ON e.id = o.enrollment_id
     WHERE e.order_id IS NOT NULL AND e.order_id <> o.id
     ORDER BY o.id`
  );

  const [paidOrphansWouldBlock] = await mysqlPool.query(
    `SELECT o.id, o.status, o.enrollment_id, o.amount, o.paid_at
     FROM orders o
     LEFT JOIN enrollments e ON e.id = o.enrollment_id
     WHERE o.enrollment_id IS NOT NULL AND e.id IS NULL
       AND o.status IN ('paid', 'refunded')`
  );

  const [pendingOrphans] = await mysqlPool.query(
    `SELECT o.id, o.status, o.enrollment_id
     FROM orders o
     LEFT JOIN enrollments e ON e.id = o.enrollment_id
     WHERE o.enrollment_id IS NOT NULL AND e.id IS NULL
       AND o.status = 'pending'`
  );

  const [[fkExists]] = await mysqlPool.query(
    `SELECT COUNT(*) AS n
     FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'orders'
       AND CONSTRAINT_NAME = 'fk_orders_enrollment' AND CONSTRAINT_TYPE = 'FOREIGN KEY'`,
    [db]
  );

  const [enrollmentDeleteImpact] = await mysqlPool.query(
    `SELECT e.id AS enrollment_id, e.status, COUNT(o.id) AS linked_orders,
            SUM(o.status = 'paid') AS paid_orders,
            SUM(o.status = 'pending') AS pending_orders
     FROM enrollments e
     INNER JOIN orders o ON o.enrollment_id = e.id
     GROUP BY e.id, e.status
     HAVING COUNT(o.id) > 0
     ORDER BY linked_orders DESC
     LIMIT 20`
  );

  const report = {
    database: db,
    analyzedAt: new Date().toISOString(),
    totals,
    fk_orders_enrollment_exists: Number(fkExists?.n ?? 0) > 0,
    orphanOrders: {
      count: orphanOrders.length,
      paidOrRefundedCount: paidOrphansWouldBlock.length,
      pendingCount: pendingOrphans.length,
      rows: orphanOrders,
    },
    userOrCourseMismatch: {
      count: userMismatch.length,
      rows: userMismatch,
    },
    enrollmentOrderIdMismatch: {
      count: enrollmentOrderMismatch.length,
      rows: enrollmentOrderMismatch,
    },
    enrollmentDeleteImpactSample: enrollmentDeleteImpact,
    migrationReady:
      orphanOrders.length === 0 &&
      userMismatch.length === 0 &&
      Number(fkExists?.n ?? 0) === 0,
  };

  console.log(JSON.stringify(report, null, 2));
  await mysqlPool.end();
  process.exit(orphanOrders.length > 0 || userMismatch.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
