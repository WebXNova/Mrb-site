#!/usr/bin/env node
import 'dotenv/config';
import { mysqlPool } from '../src/config/mysql.js';

async function main() {
  const [[db]] = await mysqlPool.query('SELECT DATABASE() AS db');

  const [orders] = await mysqlPool.query(
    `SELECT * FROM orders WHERE id IN (119, 120) ORDER BY id`
  );

  const [enrById] = await mysqlPool.query(
    `SELECT id, user_id, course_id, status, access_status, order_id, created_at, updated_at
     FROM enrollments WHERE id IN (65, 66, 64, 67) ORDER BY id`
  );

  const [enrForUser] = await mysqlPool.query(
    `SELECT id, user_id, course_id, status, order_id
     FROM enrollments WHERE user_id = 23 AND course_id = 37 ORDER BY id`
  );

  const [joinCheck] = await mysqlPool.query(
    `SELECT o.id AS order_id, o.enrollment_id, e.id AS enrollment_row_id,
            e.id IS NOT NULL AS join_matched
     FROM orders o
     LEFT JOIN enrollments e ON e.id = o.enrollment_id
     WHERE o.id IN (119, 120)`
  );

  const [allEnrollmentsCount] = await mysqlPool.query(
    `SELECT MIN(id) AS min_id, MAX(id) AS max_id, COUNT(*) AS total FROM enrollments`
  );

  const [orderEnrTypes] = await mysqlPool.query(
    `SELECT o.id, o.enrollment_id,
            CAST(o.enrollment_id AS CHAR) AS enr_cast,
            e.id AS e_id,
            o.enrollment_id = e.id AS direct_eq,
            CAST(o.enrollment_id AS UNSIGNED) = e.id AS cast_eq
     FROM orders o
     LEFT JOIN enrollments e ON e.id = o.enrollment_id
     WHERE o.id IN (119, 120)`
  );

  console.log(
    JSON.stringify(
      {
        database: db.db,
        orders,
        enrollmentsById: enrById,
        enrollmentsUser23Course37: enrForUser,
        joinCheck,
        enrollmentsIdRange: allEnrollmentsCount[0],
        typeComparison: orderEnrTypes,
      },
      null,
      2
    )
  );

  await mysqlPool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
