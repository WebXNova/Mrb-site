import { z } from 'zod';
import jwt from 'jsonwebtoken';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import { env } from '../config/env.js';
import { loginAdmin, logoutAdmin } from '../services/adminAuth.service.js';
import {
  getStudentMePayload,
  loginStudent,
  logoutStudent,
  registerStudent,
} from '../services/studentAuth.service.js';
import {
  pickActiveRefreshContext,
  refreshContextFromToken,
  rotateAuthSessionByRefreshToken,
} from '../services/authSession.service.js';
import { logActivity } from '../services/activityLog.service.js';
import { assertLoginNotLocked, recordLoginResult } from '../middleware/rateLimit.js';
import { CSRF_COOKIE_NAME, issueCsrfToken } from '../middleware/csrf.js';

function refreshCookieMaxAgeMs(refreshToken) {
  const decoded = jwt.decode(refreshToken);
  const expMs = decoded?.exp ? decoded.exp * 1000 - Date.now() : null;
  if (expMs != null && expMs > 0) return Math.ceil(expMs);
  return 7 * 24 * 60 * 60 * 1000;
}

function setRefreshCookie(res, name, refreshToken) {
  res.cookie(name, refreshToken, {
    httpOnly: true,
    sameSite: env.security.refreshCookieSameSite,
    secure: env.security.refreshCookieSecure,
    path: env.security.refreshCookiePath,
    maxAge: refreshCookieMaxAgeMs(refreshToken),
  });
}

function clearRefreshCookie(res, name) {
  res.clearCookie(name, {
    httpOnly: true,
    sameSite: env.security.refreshCookieSameSite,
    secure: env.security.refreshCookieSecure,
    path: env.security.refreshCookiePath,
  });
}

function setCsrfCookie(res, token = issueCsrfToken()) {
  res.cookie(CSRF_COOKIE_NAME, token, {
    httpOnly: false,
    sameSite: env.security.refreshCookieSameSite,
    secure: env.security.refreshCookieSecure,
    path: env.security.refreshCookiePath,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

function clearCsrfCookie(res) {
  res.clearCookie(CSRF_COOKIE_NAME, {
    httpOnly: false,
    sameSite: env.security.refreshCookieSameSite,
    secure: env.security.refreshCookieSecure,
    path: env.security.refreshCookiePath,
  });
}

async function readRefreshContext(req) {
  const adminRefreshToken = req.cookies?.admin_refresh_token;
  const studentRefreshToken = req.cookies?.student_refresh_token;
  const requestedRole = String(req.get('x-auth-role') || '').trim().toLowerCase();
  if (!adminRefreshToken && !studentRefreshToken) {
    throw new ApiError(401, 'Refresh token required');
  }
  if (requestedRole === 'admin') {
    if (!adminRefreshToken) throw new ApiError(401, 'Admin refresh token required');
    const ctx = await refreshContextFromToken(adminRefreshToken, 'admin_refresh_token');
    if (!ctx) throw new ApiError(401, 'Invalid or expired refresh token');
    if (ctx.role !== 'admin') throw new ApiError(403, 'Admin refresh token required');
    return ctx;
  }
  if (requestedRole === 'student') {
    if (!studentRefreshToken) throw new ApiError(401, 'Student refresh token required');
    const ctx = await refreshContextFromToken(studentRefreshToken, 'student_refresh_token');
    if (!ctx) throw new ApiError(401, 'Invalid or expired refresh token');
    if (ctx.role !== 'student') throw new ApiError(403, 'Student refresh token required');
    return ctx;
  }
  if (adminRefreshToken && studentRefreshToken) {
    return pickActiveRefreshContext(adminRefreshToken, studentRefreshToken);
  }
  if (adminRefreshToken) {
    const ctx = await refreshContextFromToken(adminRefreshToken, 'admin_refresh_token');
    if (!ctx) throw new ApiError(401, 'Invalid or expired refresh token');
    return ctx;
  }
  const ctx = await refreshContextFromToken(studentRefreshToken, 'student_refresh_token');
  if (!ctx) throw new ApiError(401, 'Invalid or expired refresh token');
  return ctx;
}

function assertTrustedOrigin(req) {
  const origin = req.get('origin');
  if (!origin || !String(origin).trim()) {
    throw new ApiError(403, 'Origin header required');
  }
  if (!env.security.trustedOrigins.includes(origin)) {
    throw new ApiError(403, 'Origin not allowed');
  }
}

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const studentLoginSchema = z
  .object({
    identifier: z.string().trim().min(3).max(255),
    password: z.string().trim().min(8).max(128),
  })
  .strict();

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

function getClientIp(req) {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
    return forwardedFor.split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || null;
}

export const adminLogin = asyncHandler(async (req, res) => {
  assertTrustedOrigin(req);
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(422, 'Invalid login payload', parsed.error.flatten());
  }

  const loginIdentifier = parsed.data.email.toLowerCase();
  const clientIp = getClientIp(req);
  const userAgent = req.get('user-agent') || null;
  await assertLoginNotLocked(loginIdentifier, clientIp);
  let result;
  try {
    result = await loginAdmin(parsed.data.email, parsed.data.password, { clientIp, userAgent });
    await recordLoginResult({ identifier: loginIdentifier, ipAddress: clientIp, success: true, role: 'admin', source: 'admin.login' });
  } catch (error) {
    await recordLoginResult({ identifier: loginIdentifier, ipAddress: clientIp, success: false, role: 'admin', source: 'admin.login' });
    if (error instanceof ApiError && error.statusCode === 401) {
      throw new ApiError(401, 'Invalid credentials');
    }
    throw error;
  }
  clearRefreshCookie(res, 'student_refresh_token');
  setRefreshCookie(res, 'admin_refresh_token', result.refreshToken);
  setCsrfCookie(res);

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
  assertTrustedOrigin(req);
  const refreshToken = req.cookies?.admin_refresh_token;
  await logoutAdmin(refreshToken);
  clearRefreshCookie(res, 'admin_refresh_token');
  clearCsrfCookie(res);
  await logActivity({ role: 'admin', action: 'admin.logout', entityType: 'auth' });
  res.json({ success: true, message: 'Logged out' });
});

export const studentLogout = asyncHandler(async (req, res) => {
  assertTrustedOrigin(req);
  const refreshToken = req.cookies?.student_refresh_token;
  await logoutStudent(refreshToken);
  clearRefreshCookie(res, 'student_refresh_token');
  clearCsrfCookie(res);
  await logActivity({ role: 'student', action: 'student.logout', entityType: 'auth' });
  res.json({ success: true, message: 'Logged out' });
});

export const studentRegister = asyncHandler(async (req, res) => {
  assertTrustedOrigin(req);
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(422, 'Invalid registration details', parsed.error.flatten());
  const result = await registerStudent(parsed.data);
  const clientIp = getClientIp(req);
  const userAgent = req.get('user-agent') || null;
  await logActivity({
    userId: result.student.id,
    role: 'student',
    action: 'student.register',
    entityType: 'auth',
    metadata: {
      email: result.student.email,
      username: result.student.username,
      fullName: result.student.fullName,
      ipAddress: clientIp,
      userAgent,
    },
  });
  await logActivity({
    userId: result.student.id,
    role: 'student',
    action: 'student.login',
    entityType: 'auth',
    metadata: {
      email: result.student.email,
      username: result.student.username,
      ipAddress: clientIp,
      userAgent,
      source: 'signup_auto_login',
    },
  });
  clearRefreshCookie(res, 'admin_refresh_token');
  setRefreshCookie(res, 'student_refresh_token', result.refreshToken);
  setCsrfCookie(res);
  res.status(201).json({
    success: true,
    data: { student: result.student, accessToken: result.accessToken },
  });
});

export const studentLogin = asyncHandler(async (req, res) => {
  assertTrustedOrigin(req);
  const parsed = studentLoginSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(422, 'Invalid login payload', parsed.error.flatten());
  const identifier = parsed.data.identifier.trim();
  if (!identifier) throw new ApiError(422, 'Invalid login payload');
  const loginPayload = {
    identifier,
    password: parsed.data.password,
  };
  const loginIdentifier = identifier.toLowerCase();
  const clientIp = getClientIp(req);
  const userAgent = req.get('user-agent') || null;
  await assertLoginNotLocked(loginIdentifier, clientIp);
  let result;
  try {
    result = await loginStudent({ ...loginPayload, authContext: { clientIp, userAgent } });
    await recordLoginResult({ identifier: loginIdentifier, ipAddress: clientIp, success: true, role: 'student', source: 'student.login' });
  } catch (error) {
    await recordLoginResult({ identifier: loginIdentifier, ipAddress: clientIp, success: false, role: 'student', source: 'student.login' });
    if (error instanceof ApiError && error.statusCode === 401) {
      throw new ApiError(401, 'Invalid credentials');
    }
    throw error;
  }
  await logActivity({
    userId: result.student.id,
    role: result.student.role,
    action: 'student.login',
    entityType: 'auth',
    metadata: {
      email: result.student.email,
      username: result.student.username,
      ipAddress: clientIp,
      userAgent,
      source: 'direct_login',
    },
  });
  clearRefreshCookie(res, 'admin_refresh_token');
  setRefreshCookie(res, 'student_refresh_token', result.refreshToken);
  setCsrfCookie(res);
  res.json({
    success: true,
    data: { student: result.student, accessToken: result.accessToken },
  });
});

export const studentMe = asyncHandler(async (req, res) => {
  const profile = await getStudentMePayload(req.user.id);
  if (!profile) throw new ApiError(404, 'Student not found');
  res.json({ success: true, data: profile });
});

export const refreshAuth = asyncHandler(async (req, res) => {
  assertTrustedOrigin(req);
  const refreshContext = await readRefreshContext(req);
  const clientIp = getClientIp(req);
  const userAgent = req.get('user-agent') || null;
  let rotated;
  try {
    rotated = await rotateAuthSessionByRefreshToken(refreshContext.token, { clientIp, userAgent });
  } catch (error) {
    await logActivity({
      role: refreshContext.role,
      action: 'auth.refresh_failed',
      entityType: 'auth',
      metadata: { reason: error.message },
    });
    throw error;
  }
  if (refreshContext.role === 'admin' && rotated.role !== 'admin' && rotated.role !== 'super_admin') {
    throw new ApiError(403, 'Admin refresh token required');
  }
  if (refreshContext.role === 'student' && rotated.role !== 'student') {
    throw new ApiError(403, 'Student refresh token required');
  }
  setRefreshCookie(res, refreshContext.cookieName, rotated.refreshToken);
  await logActivity({
    userId: rotated.user.id,
    role: rotated.role === 'student' ? 'student' : 'admin',
    action: 'auth.refresh',
    entityType: 'auth',
    metadata: { role: rotated.role },
  });
  res.json({
    success: true,
    data: {
      accessToken: rotated.accessToken,
      user: rotated.user,
      role: rotated.role,
    },
  });
});
