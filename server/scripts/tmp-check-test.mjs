import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
dotenv.config();

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
});

const slug = '1st-test-14';
const userId = 23;

const [[test]] = await pool.query(
  'SELECT id, title, public_slug, course_id, status, start_date, end_date, deleted_at FROM tests WHERE public_slug = ?',
  [slug]
);
const [enrollments] = await pool.query(
  'SELECT id, course_id, access_status, status FROM enrollments WHERE user_id = ?',
  [userId]
);
const [[active]] = await pool.query(
  "SELECT id, course_id, access_status, status FROM enrollments WHERE user_id = ? AND access_status = 'active'",
  [userId]
);

console.log(JSON.stringify({ test, enrollments, activeEnrollment: active, nowUtc: new Date().toISOString() }, null, 2));
await pool.end();
