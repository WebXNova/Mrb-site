import mysql from 'mysql2/promise';
import { env } from './env.js';
import { installInstructionalPoolGuard } from './mysqlGuard.js';
import { installMysqlPoolExhaustionGuard } from './mysqlPoolExhaustion.js';
import { validateMysqlPoolConfigAtStartup } from './mysqlPoolConfig.js';
import { installMysqlPoolTimeoutGuard } from './mysqlPoolTimeouts.js';

const poolConfig = env.mysql.pool;

validateMysqlPoolConfigAtStartup(poolConfig);

const rawPool = mysql.createPool({
  host: env.mysql.host,
  port: env.mysql.port,
  user: env.mysql.user,
  password: env.mysql.password,
  database: env.mysql.database,
  // Return DATETIME/TIMESTAMP columns as strings to preserve `YYYY-MM-DD HH:mm:ss`
  // formatting and avoid implicit ISO serialization with "T".
  dateStrings: true,
  waitForConnections: true,
  connectionLimit: poolConfig.connectionLimit,
  queueLimit: poolConfig.queueLimit,
  connectTimeout: poolConfig.connectTimeoutMs,
  /** Required so ad-hoc multi-statement SQL scripts can run via mysql CLI; never concatenate untrusted SQL. */
  multipleStatements: true,
});

installMysqlPoolExhaustionGuard(rawPool);
installMysqlPoolTimeoutGuard(rawPool, {
  acquireTimeoutMs: poolConfig.acquireTimeoutMs,
  queryTimeoutMs: poolConfig.queryTimeoutMs,
  transactionTimeoutMs: poolConfig.transactionTimeoutMs,
});

/** Pool with optional CEE instructional table guard (production default). */
export const mysqlPool = installInstructionalPoolGuard(rawPool);

/** Snapshot of active pool tuning (for logs, readiness, tests). */
export function getMysqlPoolConfig() {
  return {
    connectionLimit: poolConfig.connectionLimit,
    queueLimit: poolConfig.queueLimit,
    connectTimeoutMs: poolConfig.connectTimeoutMs,
    acquireTimeoutMs: poolConfig.acquireTimeoutMs,
    queryTimeoutMs: poolConfig.queryTimeoutMs,
    transactionTimeoutMs: poolConfig.transactionTimeoutMs,
  };
}

if (process.env.NODE_ENV !== 'test') {
  console.log('[mysql] pool configured', getMysqlPoolConfig());
}

export async function verifyMySqlConnection() {
  const connection = await mysqlPool.getConnection();
  try {
    await connection.ping();
  } finally {
    connection.release();
  }
}

export { withMysqlTransaction } from './mysqlPoolTimeouts.js';
