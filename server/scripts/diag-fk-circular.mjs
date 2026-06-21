#!/usr/bin/env node
import 'dotenv/config';
import { mysqlPool } from '../src/config/mysql.js';

const [refs] = await mysqlPool.query(
  `SELECT CONSTRAINT_NAME, TABLE_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
   FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
   WHERE TABLE_SCHEMA = DATABASE()
     AND (TABLE_NAME IN ('orders','enrollments') OR REFERENCED_TABLE_NAME IN ('orders','enrollments'))
     AND REFERENCED_TABLE_NAME IS NOT NULL
   ORDER BY TABLE_NAME, CONSTRAINT_NAME`
);

const [engines] = await mysqlPool.query(
  `SELECT TABLE_NAME, ENGINE FROM INFORMATION_SCHEMA.TABLES
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('orders','enrollments')`
);

const [orphans] = await mysqlPool.query(
  `SELECT o.id FROM orders o
   LEFT JOIN enrollments e ON e.id = o.enrollment_id
   WHERE o.enrollment_id IS NOT NULL AND e.id IS NULL`
);

console.log(JSON.stringify({ refs, engines, orphanCount: orphans.length }, null, 2));
await mysqlPool.end();
