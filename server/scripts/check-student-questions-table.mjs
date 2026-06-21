import { mysqlPool } from '../src/config/mysql.js';

const [tables] = await mysqlPool.query(
  "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student_questions'"
);
console.log('table:', tables.length > 0 ? 'EXISTS' : 'MISSING');

if (tables.length) {
  const [cols] = await mysqlPool.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student_questions'
     ORDER BY ORDINAL_POSITION`
  );
  console.log('columns:', cols.map((c) => c.COLUMN_NAME).join(', '));
}

await mysqlPool.end();
