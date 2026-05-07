import bcrypt from 'bcryptjs';
import { mysqlPool } from '../config/mysql.js';
import { ApiError } from '../utils/apiError.js';
import { createAuthSessionTokens, deleteAuthSessionsForUser, revokeAuthSessionByRefreshToken } from './authSession.service.js';

const RESERVED_USERNAMES = new Set(['admin', 'support', 'root', 'system']);
const FAKE_BCRYPT_HASH = '$2b$10$8fN0fSpA6W2VYJvA3pD6Guzf1u0lydBcbgQ9f7Q6w6v3zM4fM6x8S';

function normalizeUsername(username) {
  return String(username || '').trim().toLowerCase();
}

function normalizeIdentifier(identifier) {
  return String(identifier || '').trim();
}

function isEmailIdentifier(identifier) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier);
}

async function fetchStudentByEmail(email) {
  try {
    const [rows] = await mysqlPool.query(
      `SELECT id, email, username, full_name, role, password_hash, status, token_version
       FROM users
       WHERE email = ? AND role = 'student'
       LIMIT 1`,
      [email]
    );
    return rows[0] || null;
  } catch (error) {
    if (error?.code !== 'ER_BAD_FIELD_ERROR') throw error;
    const [rows] = await mysqlPool.query(
      `SELECT id, email, username, full_name, role, password_hash, status
       FROM users
       WHERE email = ? AND role = 'student'
       LIMIT 1`,
      [email]
    );
    const r = rows[0];
    return r ? { ...r, token_version: 0 } : null;
  }
}

async function fetchStudentByUsername(username) {
  const normalized = normalizeUsername(username);
  try {
    const [rows] = await mysqlPool.query(
      `SELECT id, email, username, full_name, role, password_hash, status, token_version,
              mrb_enrollment_verified_at
       FROM users
       WHERE username = ? AND role = 'student'
       LIMIT 1`,
      [normalized]
    );
    return rows[0] || null;
  } catch (error) {
    if (error?.code !== 'ER_BAD_FIELD_ERROR') throw error;
    const [rows] = await mysqlPool.query(
      `SELECT id, email, username, full_name, role, password_hash, status
       FROM users
       WHERE username = ? AND role = 'student'
       LIMIT 1`,
      [normalized]
    );
    const r = rows[0];
    return r ? { ...r, token_version: 0, mrb_enrollment_verified_at: null } : null;
  }
}

async function fetchStudentById(userId) {
  try {
    const [rows] = await mysqlPool.query(
      `SELECT id, email, username, full_name, role, password_hash, status, token_version,
              mrb_enrollment_verified_at
       FROM users
       WHERE id = ? AND role = 'student'
       LIMIT 1`,
      [userId]
    );
    return rows[0] || null;
  } catch (error) {
    if (error?.code !== 'ER_BAD_FIELD_ERROR') throw error;
    const [rows] = await mysqlPool.query(
      `SELECT id, email, username, full_name, role, password_hash, status
       FROM users
       WHERE id = ? AND role = 'student'
       LIMIT 1`,
      [userId]
    );
    const r = rows[0];
    return r ? { ...r, token_version: 0, mrb_enrollment_verified_at: null } : null;
  }
}

export async function fetchStudentForLogin({ identifier }) {
  const normalized = normalizeIdentifier(identifier);
  if (!normalized) return null;
  if (isEmailIdentifier(normalized)) {
    return fetchStudentByEmail(normalized.toLowerCase());
  }
  // Usernames are canonicalized to lowercase in storage and registration flow.
  return fetchStudentByUsername(normalized);
}

export async function registerStudent({ fullName, username, email, password }) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) {
    throw new ApiError(422, 'Email is required');
  }
  const normalizedUsername = normalizeUsername(username);
  if (normalizedUsername.includes('@')) {
    throw new ApiError(422, 'Username cannot contain @');
  }
  if (normalizedUsername.length < 3 || normalizedUsername.length > 30) {
    throw new ApiError(422, 'Username must be between 3 and 30 characters');
  }
  if (!/^[a-z0-9._]+$/.test(normalizedUsername)) {
    throw new ApiError(422, 'Username can only contain lowercase letters, numbers, underscore, and dot');
  }
  if (RESERVED_USERNAMES.has(normalizedUsername)) {
    throw new ApiError(422, 'Username is not allowed');
  }

  const [existingRows] = await mysqlPool.query(`SELECT id FROM users WHERE email = ? LIMIT 1`, [normalizedEmail]);
  if (existingRows[0]) throw new ApiError(409, 'Email already in use');
  const [existingUsernameRows] = await mysqlPool.query(`SELECT id FROM users WHERE username = ? LIMIT 1`, [normalizedUsername]);
  if (existingUsernameRows[0]) throw new ApiError(409, 'Username already in use');
  const passwordHash = await bcrypt.hash(password, 10);
  let result;
  try {
    const [insertResult] = await mysqlPool.query(
      `INSERT INTO users (email, username, password_hash, full_name, role, status)
       VALUES (?, ?, ?, ?, 'student', 'active')`,
      [normalizedEmail, normalizedUsername, passwordHash, fullName]
    );
    result = insertResult;
  } catch (error) {
    if (error?.code === 'ER_DUP_ENTRY') {
      if (String(error.message || '').includes('username')) {
        throw new ApiError(409, 'Username already in use');
      }
      if (String(error.message || '').includes('email')) {
        throw new ApiError(409, 'Email already in use');
      }
    }
    throw error;
  }
  return loginStudent({ identifier: normalizedEmail, password, expectedId: result.insertId });
}

export async function loginStudent({ identifier, password, expectedId = null, authContext = {} }) {
  const student = await fetchStudentForLogin({ identifier });
  const compareHash = student?.password_hash || FAKE_BCRYPT_HASH;
  const validPassword = await bcrypt.compare(String(password || ''), compareHash);
  if (!student || !validPassword) throw new ApiError(401, 'Invalid credentials');
  if (expectedId && Number(student.id) !== Number(expectedId)) throw new ApiError(401, 'Invalid credentials');
  if (student.status !== 'active') throw new ApiError(403, 'Student account is suspended');

  const connection = await mysqlPool.getConnection();
  try {
    await connection.beginTransaction();
    await deleteAuthSessionsForUser(student.id, connection);
    const { accessToken, refreshToken } = await createAuthSessionTokens(
      {
        userId: student.id,
        role: student.role,
        roleSnapshot: 'student',
        tokenVersion: student.token_version,
        email: student.email,
        fullName: student.full_name,
        clientIp: authContext.clientIp || null,
        userAgent: authContext.userAgent || null,
      },
      connection
    );
    await connection.commit();
    return {
      student: {
        id: student.id,
        email: student.email,
        username: student.username,
        fullName: student.full_name,
        role: student.role,
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

export async function logoutStudent(refreshToken) {
  await revokeAuthSessionByRefreshToken(refreshToken);
}

export async function getStudentMePayload(userId) {
  const row = await fetchStudentById(userId);
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    username: row.username,
    fullName: row.full_name,
    role: row.role,
  };
}
