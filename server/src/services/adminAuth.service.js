import bcrypt from 'bcryptjs';
import { mysqlPool } from '../config/mysql.js';
import { ApiError } from '../utils/apiError.js';
import { createAuthSessionTokens, deleteAuthSessionsForUser, revokeAuthSessionByRefreshToken } from './authSession.service.js';

/** Admin-login SQL `IN (...)` roles must stay aligned with `utils/isAdminRole.js`. */

const FAKE_BCRYPT_HASH = '$2b$10$8fN0fSpA6W2VYJvA3pD6Guzf1u0lydBcbgQ9f7Q6w6v3zM4fM6x8S';

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

export async function loginAdmin(email, password, authContext = {}) {
  const admin = await fetchAdminByEmail(email);
  const compareHash = admin?.password_hash || FAKE_BCRYPT_HASH;
  const validPassword = await bcrypt.compare(String(password || ''), compareHash);
  if (!admin || !validPassword) throw new ApiError(401, 'Invalid credentials');
  if (admin.status !== 'active') throw new ApiError(403, 'Admin account is suspended');

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
        clientIp: authContext.clientIp || null,
        userAgent: authContext.userAgent || null,
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

export async function getAdminMePayload(adminId) {
  const uid = Number(adminId);
  if (!Number.isInteger(uid) || uid <= 0) return null;

  try {
    const [rows] = await mysqlPool.query(
      `SELECT id, email, full_name, role, status
       FROM users
       WHERE id = ? AND role IN ('admin', 'super_admin')
       LIMIT 1`,
      [uid]
    );
    const row = rows[0];
    if (!row || String(row.status || '').toLowerCase() !== 'active') return null;
    return {
      id: row.id,
      email: row.email,
      fullName: row.full_name,
      role: row.role,
    };
  } catch (error) {
    if (error?.code !== 'ER_BAD_FIELD_ERROR') throw error;
    const [rows] = await mysqlPool.query(
      `SELECT id, email, full_name, role
       FROM users
       WHERE id = ? AND role IN ('admin', 'super_admin')
       LIMIT 1`,
      [uid]
    );
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id,
      email: row.email,
      fullName: row.full_name,
      role: row.role,
    };
  }
}
