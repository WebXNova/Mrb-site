import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { mysqlPool } from '../config/mysql.js';
import { ApiError } from '../utils/apiError.js';
import { createAuthSessionTokens, deleteAuthSessionsForUser } from './authSession.service.js';

function hashToken(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export async function loginAdmin(email, password) {
  const [rows] = await mysqlPool.query(
    `SELECT id, email, full_name, role, password_hash, status, token_version
     FROM users
     WHERE email = ? AND role IN ('admin', 'super_admin')
     LIMIT 1`,
    [email]
  );

  const admin = rows[0];
  if (!admin) throw new ApiError(401, 'Invalid credentials');
  if (admin.status !== 'active') throw new ApiError(403, 'Admin account is suspended');

  const validPassword = await bcrypt.compare(password, admin.password_hash);
  if (!validPassword) throw new ApiError(401, 'Invalid credentials');

  await deleteAuthSessionsForUser(admin.id);

  const { accessToken, refreshToken } = await createAuthSessionTokens({
    userId: admin.id,
    role: admin.role,
    roleSnapshot: admin.role,
    tokenVersion: admin.token_version,
    email: admin.email,
    fullName: admin.full_name,
  });

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
}

export async function logoutAdmin(refreshToken) {
  if (!refreshToken) return;
  const tokenHash = hashToken(refreshToken);
  await mysqlPool.query(`DELETE FROM admin_sessions WHERE refresh_token_hash = ?`, [tokenHash]);
}
