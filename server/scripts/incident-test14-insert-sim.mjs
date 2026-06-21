import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import { scopedQuery } from '../src/security/cee/db/scopedQuery.js';
import { INSERT_ENTITLED_TEST_ATTEMPT_SQL } from '../src/services/testAttempt.queries.js';

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

const conn = await pool.getConnection();
try {
  await conn.beginTransaction();
  const db = scopedQuery({ courseId: COURSE_ID, context: 'incident.sim' }, conn);

  const [[nextRow]] = await conn.query(
    `SELECT COALESCE(MAX(attempt_number), 0) + 1 AS next_attempt FROM test_attempts WHERE test_id = ? AND student_id = ?`,
    [TEST_ID, STUDENT_ID]
  );
  const attemptNumber = Number(nextRow?.next_attempt ?? 1);

  let insertResult;
  let insertError = null;
  try {
    [insertResult] = await db.execute(INSERT_ENTITLED_TEST_ATTEMPT_SQL, [
      TEST_ID,
      STUDENT_ID,
      STUDENT_ID,
      null,
      attemptNumber,
      12,
      null,
      null,
      'sim-fp',
      'sim-nonce-123456789012345678',
      STUDENT_ID,
      STUDENT_ID,
      TEST_ID,
      COURSE_ID,
    ]);
  } catch (e) {
    insertError = { message: e.message, code: e.errorCode ?? e.code, name: e.name };
  }

  console.log(JSON.stringify({
    attemptNumber,
    insertError,
    insertId: insertResult?.insertId,
    affectedRows: insertResult?.affectedRows,
  }, null, 2));

  await conn.rollback();
} finally {
  conn.release();
  await pool.end();
}
