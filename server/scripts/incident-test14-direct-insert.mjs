import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

dotenv.config();
const pool = mysql.createPool({
  host: process.env.MYSQL_HOST,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
});

const conn = await pool.getConnection();
try {
  await conn.beginTransaction();

  const [direct] = await conn.query(`
    INSERT INTO test_attempts (test_id, student_id, user_id, attempt_number, status, started_at, expires_at, last_activity_at, attempt_nonce, access_code_label)
    VALUES (14, 23, 23, 99, 'in_progress', UTC_TIMESTAMP(), DATE_ADD(UTC_TIMESTAMP(), INTERVAL 12 MINUTE), UTC_TIMESTAMP(), 'direct-nonce-test123456789', 'DIRECT')
  `);
  console.log('direct VALUES insert:', direct);

  const selectPart = await conn.query(`
    SELECT 14, 23, 23, NULL, 1, 'in_progress', UTC_TIMESTAMP(), DATE_ADD(UTC_TIMESTAMP(), INTERVAL 12 MINUTE), UTC_TIMESTAMP(), NULL, NULL, 'sim-fp', NULL, 'sim-nonce-123456789012345678', 'DIRECT'
    FROM tests t
    WHERE t.id = 14 AND t.course_id = 37 AND t.status = 'published'
      AND (t.start_date IS NULL OR t.start_date <= UTC_TIMESTAMP())
      AND (t.end_date IS NULL OR t.end_date >= UTC_TIMESTAMP())
      AND (t.allow_retake = 1 OR NOT EXISTS (
        SELECT 1 FROM test_attempts a_retake WHERE a_retake.test_id = t.id AND (a_retake.student_id = 23 OR a_retake.user_id = 23)
      ))
    LIMIT 1
  `);
  console.log('select part rows:', selectPart[0]);

  await conn.rollback();
} finally {
  conn.release();
  await pool.end();
}
