import { z } from 'zod';
import jwt from 'jsonwebtoken';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import { loginAdmin, logoutAdmin } from '../services/adminAuth.service.js';
import { loginStudent, registerStudent } from '../services/studentAuth.service.js';
import { logActivity } from '../services/activityLog.service.js';
import { assertLoginNotLocked, recordLoginResult } from '../middleware/rateLimit.js';

function refreshCookieMaxAgeMs(refreshToken) {
  const decoded = jwt.decode(refreshToken);
  const expMs = decoded?.exp ? decoded.exp * 1000 - Date.now() : null;
  if (expMs != null && expMs > 0) return Math.ceil(expMs);
  return 7 * 24 * 60 * 60 * 1000;
}

function setRefreshCookie(res, name, refreshToken, isProd) {
  res.cookie(name, refreshToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    maxAge: refreshCookieMaxAgeMs(refreshToken),
  });
}

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const COMMON_WEAK_PASSWORDS = new Set([
  'password',
  'password123',
  '12345678',
  'qwerty123',
  'admin123',
  'letmein123',
  'welcome123',
]);

const strongPasswordSchema = z
  .string()
  .min(8)
  .max(128)
  .refine((value) => /[A-Z]/.test(value), 'Password must include at least one uppercase letter')
  .refine((value) => /[a-z]/.test(value), 'Password must include at least one lowercase letter')
  .refine((value) => /\d/.test(value), 'Password must include at least one number')
  .refine((value) => /[^A-Za-z0-9]/.test(value), 'Password must include at least one special character')
  .refine((value) => !COMMON_WEAK_PASSWORDS.has(value.toLowerCase()), 'Password is too common and insecure');

const registerSchema = z.object({
  fullName: z.string().min(2).max(120),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3)
    .max(30)
    .regex(/^[a-z0-9._]+$/, 'Username can only contain lowercase letters, numbers, underscore, and dot')
    .refine((value) => !['admin', 'support', 'root', 'system'].includes(value), 'Username is not allowed'),
  email: z.string().email(),
  password: strongPasswordSchema,
});

export const adminLogin = asyncHandler(async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(422, 'Invalid login payload', parsed.error.flatten());
  }

  const loginIdentifier = parsed.data.email.toLowerCase();
  await assertLoginNotLocked(loginIdentifier);
  let result;
  try {
    result = await loginAdmin(parsed.data.email, parsed.data.password);
    await recordLoginResult({ identifier: loginIdentifier, success: true, role: 'admin', source: 'admin.login' });
  } catch (error) {
    await recordLoginResult({ identifier: loginIdentifier, success: false, role: 'admin', source: 'admin.login' });
    if (error instanceof ApiError && error.statusCode === 401) {
      throw new ApiError(401, 'Invalid credentials');
    }
    throw error;
  }
  const isProd = process.env.NODE_ENV === 'production';
  setRefreshCookie(res, 'admin_refresh_token', result.refreshToken, isProd);

  await logActivity({
    userId: result.admin.id,
    role: result.admin.role,
    action: 'admin.login',
    entityType: 'auth',
    metadata: { email: result.admin.email },
  });

  res.json({ success: true, data: { admin: result.admin, accessToken: result.accessToken } });
});

export const adminLogout = asyncHandler(async (req, res) => {
  const refreshToken = req.cookies?.admin_refresh_token;
  await logoutAdmin(refreshToken);
  res.clearCookie('admin_access_token');
  res.clearCookie('admin_refresh_token');
  res.json({ success: true, message: 'Logged out' });
});

export const studentRegister = asyncHandler(async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(422, 'Invalid registration details', parsed.error.flatten());
  const result = await registerStudent(parsed.data);
  const isProd = process.env.NODE_ENV === 'production';
  setRefreshCookie(res, 'student_refresh_token', result.refreshToken, isProd);
  res.status(201).json({
    success: true,
    data: { student: result.student, accessToken: result.accessToken },
  });
});

export const studentLogin = asyncHandler(async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(422, 'Invalid login payload', parsed.error.flatten());
  const loginIdentifier = parsed.data.email.toLowerCase();
  await assertLoginNotLocked(loginIdentifier);
  let result;
  try {
    result = await loginStudent(parsed.data);
    await recordLoginResult({ identifier: loginIdentifier, success: true, role: 'student', source: 'student.login' });
  } catch (error) {
    await recordLoginResult({ identifier: loginIdentifier, success: false, role: 'student', source: 'student.login' });
    if (error instanceof ApiError && error.statusCode === 401) {
      throw new ApiError(401, 'Invalid credentials');
    }
    throw error;
  }
  const isProd = process.env.NODE_ENV === 'production';
  setRefreshCookie(res, 'student_refresh_token', result.refreshToken, isProd);
  res.json({
    success: true,
    data: { student: result.student, accessToken: result.accessToken },
  });
});
