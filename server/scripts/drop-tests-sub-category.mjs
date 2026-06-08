import 'dotenv/config';
import { verifyMySqlConnection, mysqlPool } from '../src/config/mysql.js';

await verifyMySqlConnection();
try {
  await mysqlPool.query('ALTER TABLE tests DROP COLUMN sub_category');
  console.log('Dropped tests.sub_category');
} catch (error) {
  console.log('Drop result:', error.message);
}
const [cols] = await mysqlPool.query(
  `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tests' AND COLUMN_NAME = 'sub_category'`
);
console.log('sub_category still present:', cols.length > 0);
await mysqlPool.end();
