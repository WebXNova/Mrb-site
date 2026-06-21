import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import { scopedQuery } from '../src/security/cee/db/scopedQuery.js';
import {
  assertTestAvailabilityWindow,
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

const db = scopedQuery({ courseId: 37, context: 'debug' });
const settingsRow = await db.first(
  'SELECT start_date, end_date FROM tests WHERE id = 14 AND course_id = 37 LIMIT 1'
);

const nowMs = Date.now();
const startMs = parseTestAvailabilityInstant(settingsRow?.start_date);

console.log(JSON.stringify({
  settingsRow,
  startType: settingsRow?.start_date?.constructor?.name,
  nowIso: new Date(nowMs).toISOString(),
  startIso: startMs == null ? null : new Date(startMs).toISOString(),
  beforeStart: startMs != null && nowMs < startMs,
}, null, 2));

try {
  assertTestAvailabilityWindow(
    { id: 14, start_date: settingsRow?.start_date, end_date: settingsRow?.end_date },
    { phase: AVAILABILITY_PHASE.ANY_ACCESS }
  );
  console.log('prep assert: PASS');
} catch (e) {
  console.log('prep assert: FAIL', e.metadata);
}

await pool.end();
