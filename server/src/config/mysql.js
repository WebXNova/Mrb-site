import mysql from 'mysql2/promise';
import { env } from './env.js';

export const mysqlPool = mysql.createPool({
  host: env.mysql.host,
  port: env.mysql.port,
  user: env.mysql.user,
  password: env.mysql.password,
  database: env.mysql.database,
  // Return DATETIME/TIMESTAMP columns as strings to preserve `YYYY-MM-DD HH:mm:ss`
  // formatting and avoid implicit ISO serialization with "T".
  dateStrings: true,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  connectTimeout: Number(process.env.MYSQL_CONNECT_TIMEOUT_MS || 8000),
  /** Required so ad-hoc multi-statement SQL scripts can run via mysql CLI; never concatenate untrusted SQL. */
  multipleStatements: true,
});

export async function verifyMySqlConnection() {
  const connection = await mysqlPool.getConnection();
  try {
    await connection.ping();
  } finally {
    connection.release();
  }
}