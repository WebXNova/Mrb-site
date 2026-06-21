import bcrypt from 'bcryptjs';
import { mysqlPool } from '../config/mysql.js';
import { ApiError } from '../utils/apiError.js';
import { createAuthSessionTokens, deleteAuthSessionsForUser, revokeAuthSessionByRefreshToken } from './authSession.service.js';

const FAKE_BCRYPT_HASH = '$2b$10$8fN0fSpA6W2VYJvA3pD6Guzf1u0lydBcbgQ9f7Q6w6v3zM4fM6x8S';

function normalizeIdentifier(identifier) {
  return String(identifier || '').trim();
}

function isEmailIdentifier(identifier) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier);
}

async function fetchTeacherByEmail(email) {
  const [rows] = await mysqlPool.query(
    `SELECT id, email, username, full_name, role, password_hash, status, token_version
     FROM users
     WHERE email = ? AND role = 'teacher'
     LIMIT 1`,
    [email]
  );
  return rows[0] || null;
}

async function fetchTeacherByUsername(username) {
  const normalized = String(username || '').trim().toLowerCase();
  const [rows] = await mysqlPool.query(
    `SELECT id, email, username, full_name, role, password_hash, status, token_version
     FROM users
     WHERE username = ? AND role = 'teacher'
     LIMIT 1`,
    [normalized]
  );
  return rows[0] || null;
}

async function fetchTeacherById(userId) {
  const [rows] = await mysqlPool.query(
    `SELECT id, email, username, full_name, role, status, token_version
     FROM users
     WHERE id = ? AND role = 'teacher'
     LIMIT 1`,
    [userId]
  );
  return rows[0] || null;
}

export async function fetchTeacherForLogin({ identifier }) {
  const normalized = normalizeIdentifier(identifier);
  if (!normalized) return null;
  if (isEmailIdentifier(normalized)) {
    return fetchTeacherByEmail(normalized.toLowerCase());
  }
  return fetchTeacherByUsername(normalized);
}

export async function loginTeacher({ identifier, password, authContext = {} }) {
  const teacher = await fetchTeacherForLogin({ identifier });
  const compareHash = teacher?.password_hash || FAKE_BCRYPT_HASH;
  const validPassword = await bcrypt.compare(String(password || ''), compareHash);
  if (!teacher || !validPassword) throw new ApiError(401, 'Invalid credentials');
  if (teacher.status !== 'active') throw new ApiError(403, 'Teacher account is inactive');

  const connection = await mysqlPool.getConnection();
  try {
    await connection.beginTransaction();
    await deleteAuthSessionsForUser(teacher.id, connection);
    const { accessToken, refreshToken } = await createAuthSessionTokens(
      {
        userId: teacher.id,
        role: teacher.role,
        roleSnapshot: 'teacher',
        tokenVersion: teacher.token_version,
        email: teacher.email,
        fullName: teacher.full_name,
        clientIp: authContext.clientIp || null,
        userAgent: authContext.userAgent || null,
      },
      connection
    );
    await connection.commit();
    return {
      teacher: {
        id: teacher.id,
        email: teacher.email,
        username: teacher.username,
        fullName: teacher.full_name,
        role: teacher.role,
        status: teacher.status,
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

export async function logoutTeacher(refreshToken) {
  await revokeAuthSessionByRefreshToken(refreshToken);
}

export async function getTeacherMePayload(userId) {
  const row = await fetchTeacherById(userId);
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    username: row.username,
    fullName: row.full_name,
    role: row.role,
    status: row.status,
  };
}
