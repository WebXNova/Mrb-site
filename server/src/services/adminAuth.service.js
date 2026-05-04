import bcrypt from 'bcryptjs';
import { mysqlPool } from '../config/mysql.js';
import { ApiError } from '../utils/apiError.js';
import { createAuthSessionTokens, deleteAuthSessionsForUser, revokeAuthSessionByRefreshToken } from './authSession.service.js';

async function fetchAdminByEmail(email) {
  try {
    const [rows] = await mysqlPool.query(
      `SELECT id, email, full_name, role, password_hash, status, token_version
       FROM users
       WHERE email = ? AND role IN ('admin', 'super_admin')
       LIMIT 1`,
      [email]
    );
    return rows[0] || null;
  } catch (error) {
    if (error?.code !== 'ER_BAD_FIELD_ERROR') throw error;
    const [rows] = await mysqlPool.query(
      `SELECT id, email, full_name, role, password_hash, status
       FROM users
       WHERE email = ? AND role IN ('admin', 'super_admin')
       LIMIT 1`,
      [email]
    );
    return rows[0] ? { ...rows[0], token_version: 0 } : null;
  }
}

export async function loginAdmin(email, password) {
  const admin = await fetchAdminByEmail(email);
  if (!admin) throw new ApiError(401, 'Invalid credentials');
  if (admin.status !== 'active') throw new ApiError(403, 'Admin account is suspended');

  const validPassword = await bcrypt.compare(password, admin.password_hash);
  if (!validPassword) throw new ApiError(401, 'Invalid credentials');

  const connection = await mysqlPool.getConnection();
  try {
    await connection.beginTransaction();
    // Single active session: revoke prior rows (soft), then insert new session — atomic to prevent concurrent double-active rows.
    await deleteAuthSessionsForUser(admin.id, connection);
    const { accessToken, refreshToken } = await createAuthSessionTokens(
      {
        userId: admin.id,
        role: admin.role,
        roleSnapshot: admin.role,
        tokenVersion: admin.token_version,
        email: admin.email,
        fullName: admin.full_name,
      },
      connection
    );
    await connection.commit();
    return {
      admin: {
        id: admin.id,
        email: admin.email,
        fullName: admin.full_name,
        role: admin.role,
      },
      accessToken,
      refreshToken,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function logoutAdmin(refreshToken) {
  await revokeAuthSessionByRefreshToken(refreshToken);
}
