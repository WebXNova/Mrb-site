import mysql from 'mysql2/promise';
import { env } from './env.js';

let _mysqlPool = null;

function getMysqlPool() {
  if (_mysqlPool) return _mysqlPool;

  const { host, port, user, password, database } = env.mysql;
  if (!host) throw new Error('Missing required env variable: MYSQL_HOST');
  if (!user) throw new Error('Missing required env variable: MYSQL_USER');
  if (!password) throw new Error('Missing required env variable: MYSQL_PASSWORD');
  if (!database) throw new Error('Missing required env variable: MYSQL_DATABASE');

  _mysqlPool = mysql.createPool({
    host,
    port,
    user,
    password,
    database,
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

  return _mysqlPool;
}

/**
 * Proxy that defers pool creation until first use, so Railway has time to
 * inject resolved reference variables before the connection is attempted.
 */
export const mysqlPool = new Proxy(
  {},
  {
    get(_target, prop) {
      return getMysqlPool()[prop];
    },
  }
);

export async function verifyMySqlConnection() {
  const pool = getMysqlPool();
  const connection = await pool.getConnection();
  try {
    await connection.ping();
  } finally {
    connection.release();
  }
}