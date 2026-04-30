import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { mysqlPool } from '../config/mysql.js';
import { env } from '../config/env.js';
import { ApiError } from '../utils/apiError.js';

const RESERVED_USERNAMES = new Set(['admin', 'support', 'root', 'system']);

function normalizeUsername(username) {
  return String(username || '').trim().toLowerCase();
}

export async function registerStudent({ fullName, username, email, password }) {
  const normalizedUsername = normalizeUsername(username);
  if (normalizedUsername.length < 3 || normalizedUsername.length > 30) {
    throw new ApiError(422, 'Username must be between 3 and 30 characters');
  }
  if (!/^[a-z0-9._]+$/.test(normalizedUsername)) {
    throw new ApiError(422, 'Username can only contain lowercase letters, numbers, underscore, and dot');
  }
  if (RESERVED_USERNAMES.has(normalizedUsername)) {
    throw new ApiError(422, 'Username is not allowed');
  }

  const [existingRows] = await mysqlPool.query(`SELECT id FROM users WHERE email = ? LIMIT 1`, [email]);
  if (existingRows[0]) throw new ApiError(409, 'Email already in use');
  const [existingUsernameRows] = await mysqlPool.query(`SELECT id FROM users WHERE username = ? LIMIT 1`, [normalizedUsername]);
  if (existingUsernameRows[0]) throw new ApiError(409, 'Username already in use');
  const passwordHash = await bcrypt.hash(password, 10);
  let result;
  try {
    const [insertResult] = await mysqlPool.query(
      `INSERT INTO users (email, username, password_hash, full_name, role, status)
       VALUES (?, ?, ?, ?, 'student', 'active')`,
      [email, normalizedUsername, passwordHash, fullName]
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
  return loginStudent({ email, password, expectedId: result.insertId });
}

export async function loginStudent({ email, password, expectedId = null }) {
  const [rows] = await mysqlPool.query(
    `SELECT id, email, username, full_name, role, password_hash, status, token_version
     FROM users
     WHERE email = ? AND role = 'student'
     LIMIT 1`,
    [email]
  );
  const student = rows[0];
  if (!student) throw new ApiError(401, 'Invalid credentials');
  if (expectedId && Number(student.id) !== Number(expectedId)) throw new ApiError(401, 'Invalid credentials');
  if (student.status !== 'active') throw new ApiError(403, 'Student account is suspended');
  const validPassword = await bcrypt.compare(password, student.password_hash);
  if (!validPassword) throw new ApiError(401, 'Invalid credentials');

  const accessToken = jwt.sign(
    {
      id: student.id,
      email: student.email,
      role: student.role,
      name: student.full_name,
      type: 'access',
      tokenVersion: Number(student.token_version || 0),
    },
    env.jwt.accessSecret,
    {
      expiresIn: env.jwt.accessExpiresIn,
      issuer: env.jwt.issuer,
      audience: env.jwt.audience,
    }
  );
  return {
    student: {
      id: student.id,
      email: student.email,
      username: student.username,
      fullName: student.full_name,
      role: student.role,
    },
    accessToken,
  };
}
