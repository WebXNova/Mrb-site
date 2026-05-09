import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env'), override: true });

const cfg = {
  host: process.env.MYSQL_HOST,
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
};

try {
  const c = await mysql.createConnection(cfg);
  const [tables] = await c.query("SHOW TABLES LIKE 'enrollments'");
  console.log('MySQL OK, enrollments:', tables.length ? 'table exists' : 'TABLE MISSING');
  if (tables.length) {
    const [cols] = await c.query('SHOW COLUMNS FROM enrollments');
    console.log('Columns:', cols.map((r) => r.Field).join(', '));
    const [row] = await c.query(
      `SELECT COUNT(*) AS n FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'enrollments' AND index_name LIKE 'uq_enrollments%'`
    );
    console.log('Unique indexes (uq_*):', row[0]?.n);
  }
  await c.end();
} catch (e) {
  console.error('FAIL:', e.code, e.errno, e.sqlMessage || e.message);
  process.exit(1);
}
