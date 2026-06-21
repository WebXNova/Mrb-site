import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import {
  assertTestAvailabilityWindow,
  fetchUtcNowMs,
  parseTestAvailabilityInstant,
  AVAILABILITY_PHASE,
} from '../src/services/testAvailabilityWindow.service.js';

dotenv.config();

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
});

const conn = await pool.getConnection();
try {
  const [[row]] = await conn.query(
    `SELECT id, course_id, start_date, end_date, status FROM tests WHERE id = 14 AND course_id = 37 FOR UPDATE`
  );
  const nowMs = await fetchUtcNowMs(conn);
  const startMs = parseTestAvailabilityInstant(row?.start_date);
  const endMs = parseTestAvailabilityInstant(row?.end_date);

  console.log('row types:', {
    start_date: row?.start_date,
    start_type: row?.start_date?.constructor?.name,
    end_date: row?.end_date,
    end_type: row?.end_date?.constructor?.name,
  });
  console.log('parsed:', {
    nowMs,
    nowIso: new Date(nowMs).toISOString(),
    startMs,
    startIso: startMs == null ? null : new Date(startMs).toISOString(),
    endMs,
    endIso: endMs == null ? null : new Date(endMs).toISOString(),
    beforeStart: startMs != null && nowMs < startMs,
    afterEnd: endMs != null && nowMs > endMs,
  });

  try {
    assertTestAvailabilityWindow(row, {
      phase: AVAILABILITY_PHASE.ANY_ACCESS,
      nowMs,
    });
    console.log('ANY_ACCESS: ok');
  } catch (e) {
    console.log('ANY_ACCESS failed:', e.metadata);
  }

  const [attempts] = await conn.query(
    `SELECT id, status, started_at, expires_at FROM test_attempts WHERE test_id = 14 AND user_id = 23`
  );
  console.log('attempts:', attempts);
} finally {
  conn.release();
  await pool.end();
}
