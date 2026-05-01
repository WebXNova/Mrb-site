import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { mysqlPool } from '../config/mysql.js';
import { env } from '../config/env.js';
import { ApiError } from '../utils/apiError.js';

function hashToken(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

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

  const accessToken = jwt.sign(
    {
      id: admin.id,
      email: admin.email,
      role: admin.role,
      name: admin.full_name,
      type: 'access',
      tokenVersion: Number(admin.token_version || 0),
    },
    env.jwt.accessSecret,
    {
      expiresIn: env.jwt.accessExpiresIn,
      issuer: env.jwt.issuer,
      audience: env.jwt.audience,
    }
  );

  const refreshToken = jwt.sign(
    { id: admin.id, role: admin.role, type: 'refresh' },
    env.jwt.refreshSecret,
    {
      expiresIn: env.jwt.refreshExpiresIn,
      issuer: env.jwt.issuer,
      audience: env.jwt.audience,
    }
  );

  const decodedRefresh = jwt.decode(refreshToken);
  try {
    await mysqlPool.query(
      `INSERT INTO admin_sessions (admin_id, refresh_token_hash, expires_at)
       VALUES (?, ?, FROM_UNIXTIME(?))`,
      [admin.id, hashToken(refreshToken), decodedRefresh.exp]
    );
  } catch (error) {
    if (error?.code !== 'ER_NO_SUCH_TABLE') throw error;
  }

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
