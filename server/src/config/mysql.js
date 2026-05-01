import mysql from 'mysql2/promise';
import { env } from './env.js';

export const mysqlPool = mysql.createPool({
  host: env.mysql.host,
  port: env.mysql.port,
  user: env.mysql.user,
  password: env.mysql.password,
  database: env.mysql.database,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

export async function verifyMySqlConnection() {
  const connection = await mysqlPool.getConnection();
  try {
    await connection.ping();
  } finally {
    connection.release();
  }
}