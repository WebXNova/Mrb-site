import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

dotenv.config();

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
});

const [[row]] = await pool.query('SELECT UTC_TIMESTAMP(3) AS utc_now, NOW(3) AS local_now');
await pool.end();

console.log(JSON.stringify({
  nodeNowIso: new Date().toISOString(),
  nodeNowMs: Date.now(),
  mysqlUtcNow: row?.utc_now,
  mysqlLocalNow: row?.local_now,
  tzOffsetMin: new Date().getTimezoneOffset(),
}, null, 2));
