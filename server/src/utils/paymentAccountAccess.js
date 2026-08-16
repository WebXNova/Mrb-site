import { mysqlPool } from '../config/mysql.js';

/**
 * Payment account writes — DB role is authoritative (not JWT snapshot).
 * @param {number} userId
 * @returns {Promise<boolean>}
 */
export async function canWritePaymentAccounts(userId) {
  const id = Number(userId);
  if (!Number.isInteger(id) || id <= 0) return false;

  const [rows] = await mysqlPool.query(
    `SELECT role FROM users WHERE id = ? AND role IN ('admin', 'super_admin') LIMIT 1`,
    [id]
  );
  return String(rows[0]?.role || '').trim().toLowerCase() === 'super_admin';
}
