import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { mysqlPool } from '../config/mysql.js';
import { env } from '../config/env.js';
import { ApiError } from '../utils/apiError.js';

export async function registerStudent({ fullName, email, password }) {
  const [existingRows] = await mysqlPool.query(`SELECT id FROM users WHERE email = ? LIMIT 1`, [email]);
  if (existingRows[0]) throw new ApiError(409, 'Email already in use');
  const passwordHash = await bcrypt.hash(password, 10);
  const [result] = await mysqlPool.query(
    `INSERT INTO users (email, password_hash, full_name, role, status)
     VALUES (?, ?, ?, 'student', 'active')`,
    [email, passwordHash, fullName]
  );
  return loginStudent({ email, password, expectedId: result.insertId });
}

export async function loginStudent({ email, password, expectedId = null }) {
  const [rows] = await mysqlPool.query(
    `SELECT id, email, full_name, role, password_hash, status
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
    { id: student.id, email: student.email, role: student.role, name: student.full_name },
    env.jwt.accessSecret,
    { expiresIn: env.jwt.accessExpiresIn }
  );
  return {
    student: { id: student.id, email: student.email, fullName: student.full_name, role: student.role },
    accessToken,
  };
}
