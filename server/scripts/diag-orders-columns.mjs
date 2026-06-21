#!/usr/bin/env node
import 'dotenv/config';
import { mysqlPool } from '../src/config/mysql.js';
const [c] = await mysqlPool.query(
  `SELECT COLUMN_NAME, COLUMN_TYPE, EXTRA FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='orders' ORDER BY ORDINAL_POSITION`
);
const [i] = await mysqlPool.query(
  `SELECT INDEX_NAME, COLUMN_NAME FROM INFORMATION_SCHEMA.STATISTICS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='orders' ORDER BY INDEX_NAME, SEQ_IN_INDEX`
);
console.log(JSON.stringify({ columns: c, indexes: i }, null, 2));
await mysqlPool.end();
