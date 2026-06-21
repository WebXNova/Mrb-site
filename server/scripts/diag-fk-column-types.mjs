#!/usr/bin/env node
import 'dotenv/config';
import { mysqlPool } from '../src/config/mysql.js';

const [cols] = await mysqlPool.query(
  `SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLLATION_NAME
   FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND ((TABLE_NAME = 'orders' AND COLUMN_NAME = 'enrollment_id')
       OR (TABLE_NAME = 'enrollments' AND COLUMN_NAME = 'id'))
   ORDER BY TABLE_NAME`
);
const [orders] = await mysqlPool.query('SELECT id, enrollment_id, status FROM orders ORDER BY id');
console.log(JSON.stringify({ columns: cols, orders }, null, 2));
await mysqlPool.end();
