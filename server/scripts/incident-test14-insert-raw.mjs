import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import { INSERT_ENTITLED_TEST_ATTEMPT_SQL } from '../src/services/testAttempt.queries.js';
import { TEST_AVAILABILITY_CREATE_WHERE_SQL } from '../src/services/testAvailabilityWindow.queries.js';
import { TEST_RETAKE_CREATE_WHERE_SQL } from '../src/services/testRetakePolicy.queries.js';

dotenv.config();

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
});

const TEST_ID = 14;
const STUDENT_ID = 23;
const COURSE_ID = 37;
const params = [TEST_ID, STUDENT_ID, STUDENT_ID, null, 1, 12, null, null, 'sim-fp', 'sim-nonce-123456789012345678', STUDENT_ID, STUDENT_ID, TEST_ID, COURSE_ID];

const conn = await pool.getConnection();
try {
  await conn.beginTransaction();

  const guardSql = `
    SELECT t.id AS would_insert, t.start_date, t.end_date, t.allow_retake,
      (t.start_date IS NULL OR t.start_date <= UTC_TIMESTAMP()) AS start_ok,
      (t.end_date IS NULL OR t.end_date >= UTC_TIMESTAMP()) AS end_ok,
      UTC_TIMESTAMP() AS utc_now
    FROM tests t
    WHERE t.id = ? AND t.course_id = ? AND t.status = 'published'
      ${TEST_AVAILABILITY_CREATE_WHERE_SQL}
      ${TEST_RETAKE_CREATE_WHERE_SQL}
    LIMIT 1`;

  const [[guard]] = await conn.query(guardSql, [TEST_ID, COURSE_ID, STUDENT_ID, STUDENT_ID]);
  console.log('=== GUARD SELECT (in TX) ===', JSON.stringify(guard, null, 2));

  const [insertResult] = await conn.query(INSERT_ENTITLED_TEST_ATTEMPT_SQL, params);
  console.log('=== RAW INSERT RESULT ===', JSON.stringify({ insertId: insertResult.insertId, affectedRows: insertResult.affectedRows }, null, 2));

  await conn.rollback();
} finally {
  conn.release();
  await pool.end();
}
