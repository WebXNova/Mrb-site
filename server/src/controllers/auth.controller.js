import { z } from 'zod';
import jwt from 'jsonwebtoken';
import { mysqlPool } from '../config/mysql.js';
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
  getTeacherMePayload,
  loginTeacher,
  logoutTeacher,
} from '../services/teacherAuth.service.js';
import {
  revokeAllAuthSessionsForUser,
  refreshContextFromToken,
  rotateAuthSessionByRefreshToken,
  verifyRefreshToken,
} from '../services/authSession.service.js';
import { logActivity } from '../services/activityLog.service.js';
import { assertLoginNotLocked, recordLoginResult, consumeForgotPasswordEmailRateLimit } from '../middleware/rateLimit.js';
import { CSRF_COOKIE_NAME, issueCsrfToken } from '../middleware/csrf.js';
import {
  createAndSendVerificationToken,
  resendVerificationEmail,
  verifyEmailByToken,
} from '../services/emailVerification.service.js';
import { createAndSendPasswordResetToken, resetStudentPassword } from '../services/passwordReset.service.js';
import { verifyGoogleIdToken } from '../services/googleAuth.service.js';
import { loginOrRegisterStudentWithGoogle } from '../services/googleStudentAuth.service.js';
import { getClientIp } from '../utils/network.js';
import { assertCaptchaIfRequired } from '../services/abuseProtection.service.js';
import { sendSuccess } from '../utils/httpEnvelope.js';
import { isAdminRole } from '../utils/isAdminRole.js';
import { startAuthTrace } from '../utils/authProfiling.js';
import { applyAuthResponseSecurityHeaders } from '../utils/authResponseHeaders.js';

function refreshCookieMaxAgeMs(refreshToken) {
  const decoded = jwt.decode(refreshToken);
  const expMs = decoded?.exp ? decoded.exp * 1000 - Date.now() : null;
  if (expMs != null && expMs > 0) return Math.ceil(expMs);
  return env.security.refreshCookieMaxAgeMs;
}

function setRefreshCookie(res, name, refreshToken) {
  res.cookie(name, refreshToken, {
    httpOnly: true,
    sameSite: env.security.refreshCookieSameSite,
    secure: env.security.refreshCookieSecure,
    path: env.security.refreshCookiePath,
    maxAge: refreshCookieMaxAgeMs(refreshToken),
    ...(env.nodeEnv === 'production' ? { priority: 'high' } : {}),
  });
}

function accessCookieName(role) {
  if (role === 'student') return 'student_access_token';
  if (role === 'teacher') return 'teacher_access_token';
  return 'admin_access_token';
}

function setAccessCookie(res, role, accessToken) {
  const name = accessCookieName(role);
  res.cookie(name, accessToken, {
    httpOnly: true,
    sameSite: env.security.accessCookieSameSite,
    secure: env.security.accessCookieSecure,
    path: env.security.accessCookiePath,
    maxAge: env.security.accessCookieMaxAgeMs,
    ...(env.nodeEnv === 'production' ? { priority: 'high' } : {}),
  });
}

function clearAccessCookie(res, role) {
  const name = accessCookieName(role);
  res.clearCookie(name, {
    httpOnly: true,
    sameSite: env.security.accessCookieSameSite,
    secure: env.security.accessCookieSecure,
    path: env.security.accessCookiePath,
  });
}

function clearRealmCookies(res, role) {
  if (role === 'student') {
    clearRefreshCookie(res, 'student_refresh_token');
    clearAccessCookie(res, 'student');
    return;
  }
  if (role === 'teacher') {
    clearRefreshCookie(res, 'teacher_refresh_token');
    clearAccessCookie(res, 'teacher');
    return;
  }
  clearRefreshCookie(res, 'admin_refresh_token');
  clearAccessCookie(res, 'admin');
}

function clearAllRealmCookies(res) {
  clearRefreshCookie(res, 'admin_refresh_token');
  clearRefreshCookie(res, 'student_refresh_token');
  clearRefreshCookie(res, 'teacher_refresh_token');
  clearAccessCookie(res, 'admin');
  clearAccessCookie(res, 'student');
  clearAccessCookie(res, 'teacher');
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
  const sameSite = env.security.refreshCookieSameSite;
  const secure = env.security.refreshCookieSecure;
  // Clear legacy CSRF cookie so two `csrf_token` variants cannot confuse parsing on `/api/auth/*`.
  res.clearCookie(CSRF_COOKIE_NAME, {
    httpOnly: false,
    sameSite,
    secure,
    path: env.security.refreshCookiePath,
  });
  res.cookie(CSRF_COOKIE_NAME, token, {
    httpOnly: false,
    sameSite,
    secure,
    path: env.security.csrfCookiePath,
    maxAge: env.security.refreshCookieMaxAgeMs,
  });
}

function clearCsrfCookie(res) {
  const sameSite = env.security.refreshCookieSameSite;
  const secure = env.security.refreshCookieSecure;
  res.clearCookie(CSRF_COOKIE_NAME, {
    httpOnly: false,
    sameSite,
    secure,
    path: env.security.csrfCookiePath,
  });
  res.clearCookie(CSRF_COOKIE_NAME, {
    httpOnly: false,
    sameSite,
    secure,
    path: env.security.refreshCookiePath,
  });
}

async function readRefreshContext(req) {
  const adminRefreshToken = req.cookies?.admin_refresh_token;
  const studentRefreshToken = req.cookies?.student_refresh_token;
  const teacherRefreshToken = req.cookies?.teacher_refresh_token;
  const requestedRole = String(req.get('x-auth-role') || '').trim().toLowerCase();
  if (!adminRefreshToken && !studentRefreshToken && !teacherRefreshToken) {
    throw new ApiError(401, 'Refresh token required');
  }
  if (requestedRole === 'admin') {
    if (!adminRefreshToken) throw new ApiError(401, 'Admin refresh token required');
    const ctx = await refreshContextFromToken(adminRefreshToken, 'admin_refresh_token');
    if (!ctx) throw new ApiError(401, 'Invalid or expired refresh token');
    if (!isAdminRole(ctx.role)) throw new ApiError(403, 'Admin refresh token required');
    return ctx;
  }
  if (requestedRole === 'student') {
    if (!studentRefreshToken) throw new ApiError(401, 'Student refresh token required');
    const ctx = await refreshContextFromToken(studentRefreshToken, 'student_refresh_token');
    if (!ctx) throw new ApiError(401, 'Invalid or expired refresh token');
    if (ctx.role !== 'student') throw new ApiError(403, 'Student refresh token required');
    return ctx;
  }
  if (requestedRole === 'teacher') {
    if (!teacherRefreshToken) throw new ApiError(401, 'Teacher refresh token required');
    const ctx = await refreshContextFromToken(teacherRefreshToken, 'teacher_refresh_token');
    if (!ctx) throw new ApiError(401, 'Invalid or expired refresh token');
    if (ctx.role !== 'teacher') throw new ApiError(403, 'Teacher refresh token required');
    return ctx;
  }
  const activeTokens = [adminRefreshToken, studentRefreshToken, teacherRefreshToken].filter(Boolean);
  if (activeTokens.length > 1) {
    throw new ApiError(400, 'Ambiguous refresh context. Provide x-auth-role header.');
  }
  if (adminRefreshToken) {
    const ctx = await refreshContextFromToken(adminRefreshToken, 'admin_refresh_token');
    if (!ctx) throw new ApiError(401, 'Invalid or expired refresh token');
    return ctx;
  }
  if (teacherRefreshToken) {
    const ctx = await refreshContextFromToken(teacherRefreshToken, 'teacher_refresh_token');
    if (!ctx) throw new ApiError(401, 'Invalid or expired refresh token');
    return ctx;
  }
  const ctx = await refreshContextFromToken(studentRefreshToken, 'student_refresh_token');
  if (!ctx) throw new ApiError(401, 'Invalid or expired refresh token');
  return ctx;
}

function resolveTrustedRequestOrigin(req) {
  const origin = String(req.get('origin') || '').trim();
  if (origin) return origin;

  // Same-origin GET (e.g. Vite /api proxy) often omits Origin; derive from Referer when present.
  const referer = String(req.get('referer') || '').trim();
  if (referer) {
    try {
      return new URL(referer).origin;
    } catch {
      // ignore malformed referer
    }
  }

  // Reverse-proxy / first-party boot requests may omit both Origin and Referer.
  const host = String(req.get('host') || '').trim();
  if (host) {
    const forwardedProto = String(req.get('x-forwarded-proto') || '').split(',')[0].trim();
    const proto =
      forwardedProto === 'https' || forwardedProto === 'http'
        ? forwardedProto
        : req.secure
          ? 'https'
          : 'http';
    return `${proto}://${host}`;
  }

  return '';
}

function assertTrustedOrigin(req) {
  const origin = resolveTrustedRequestOrigin(req);
  if (!origin) {
    throw new ApiError(403, 'Origin header required');
  }
  if (!env.security.trustedOrigins.includes(origin)) {
    throw new ApiError(403, 'Origin not allowed');
  }
}

async function logAuthSessionEnd(req, role, action) {
  await logActivity({
    userId: req.user?.id ?? null,
    role,
    action,
    entityType: 'auth',
    metadata: {
      ipAddress: getClientIp(req),
      userAgent: req.get('user-agent') || null,
      sessionId: req.user?.sid || null,
    },
  });
}

function finalizeAuthSuccessResponse(res) {
  applyAuthResponseSecurityHeaders(res);
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

const googleAuthSchema = z
  .object({
    credential: z.string().trim().min(20).max(8192),
  })
  .strict();

/**
 * Establishes a browser-readable CSRF cookie at CSRF_COOKIE_PATH (typically `/`).
 * Trusted Origin only; does not authenticate. Used after deploy/path changes so the SPA can read `csrf_token` before refresh/logout POSTs.
 */
export const issueCsrfSession = asyncHandler(async (req, res) => {
  try {
    assertTrustedOrigin(req);
    setCsrfCookie(res);
    res.status(204).send();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(503, 'Could not establish CSRF session', {
      code: 'CSRF_SESSION_UNAVAILABLE',
      metadata: { reason: error instanceof Error ? error.message : String(error) },
    });
  }
});

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
  clearRealmCookies(res, 'admin');
  setRefreshCookie(res, 'admin_refresh_token', result.refreshToken);
  setAccessCookie(res, 'admin', result.accessToken);
  setCsrfCookie(res);

  await logActivity({
    userId: result.admin.id,
    role: result.admin.role,
    action: 'admin.login',
    entityType: 'auth',
    metadata: { email: result.admin.email, ipAddress: clientIp, userAgent },
  });

  finalizeAuthSuccessResponse(res);
  sendSuccess(res, { admin: result.admin });
});

export const adminLogout = asyncHandler(async (req, res) => {
  assertTrustedOrigin(req);
  const refreshToken = req.cookies?.admin_refresh_token;
  await logoutAdmin(refreshToken);
  clearRefreshCookie(res, 'admin_refresh_token');
  clearAccessCookie(res, 'admin');
  await logAuthSessionEnd(req, 'admin', 'admin.logout');
  finalizeAuthSuccessResponse(res);
  sendSuccess(res, { message: 'Logged out' });
});

export const studentLogout = asyncHandler(async (req, res) => {
  assertTrustedOrigin(req);
  const refreshToken = req.cookies?.student_refresh_token;
  await logoutStudent(refreshToken);
  clearRefreshCookie(res, 'student_refresh_token');
  clearAccessCookie(res, 'student');
  await logAuthSessionEnd(req, 'student', 'student.logout');
  finalizeAuthSuccessResponse(res);
  sendSuccess(res, { message: 'Logged out' });
});

export const studentRegister = asyncHandler(async (req, res) => {
  assertTrustedOrigin(req);
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(422, 'Invalid registration details', parsed.error.flatten());
  const normalizedDomain = String(parsed.data.email || '')
    .trim()
    .toLowerCase()
    .split('@')[1];
  if (env.abuse.blockedEmailDomains.includes(normalizedDomain)) {
    throw new ApiError(422, 'Email domain is not allowed');
  }
  const clientIp = getClientIp(req);
  await assertCaptchaIfRequired({
    action: 'signup',
    ipAddress: clientIp,
    captchaToken: req.body?.captchaToken || req.get('x-captcha-token') || '',
  });
  const result = await registerStudent(parsed.data);
  const userAgent = req.get('user-agent') || null;
  await createAndSendVerificationToken({
    userId: result.student.id,
    email: result.student.email,
    fullName: result.student.fullName,
    ipAddress: clientIp,
    userAgent,
    reason: 'signup',
  });
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
  clearRealmCookies(res, 'student');
  setRefreshCookie(res, 'student_refresh_token', result.refreshToken);
  setAccessCookie(res, 'student', result.accessToken);
  setCsrfCookie(res);
  finalizeAuthSuccessResponse(res);
  sendSuccess(res, { student: result.student }, 201);
});

export const verifyEmail = asyncHandler(async (req, res) => {
  const parsedBody = verifyEmailBodySchema.safeParse(req.body);
  const token = parsedBody.success ? parsedBody.data.token : null;
  if (!token) throw new ApiError(400, 'Invalid or expired verification link');
  const clientIp = getClientIp(req);
  const userAgent = req.get('user-agent') || null;
  await verifyEmailByToken({ rawToken: token, ipAddress: clientIp, userAgent });
  clearAllRealmCookies(res);
  clearCsrfCookie(res);
  res.setHeader('Cache-Control', 'no-store, no-cache, max-age=0, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Referrer-Policy', 'no-referrer');
  sendSuccess(res, { message: 'Email verified successfully. Please sign in again.' });
});

export const resendVerification = asyncHandler(async (req, res) => {
  const startedAt = Date.now();
  const normalizedMessage = 'If the email exists, a verification email has been sent.';
  const parsed = resendVerificationSchema.safeParse(req.body);
  if (parsed.success) {
    const email = parsed.data.email.toLowerCase();
    const clientIp = getClientIp(req);
    await assertCaptchaIfRequired({
      action: 'resend_verification',
      ipAddress: clientIp,
      captchaToken: req.body?.captchaToken || req.get('x-captcha-token') || '',
    });
    try {
      const [rows] = await mysqlPool.query(
        `SELECT id, email, full_name, is_verified
         FROM users
         WHERE email = ? AND role = 'student'
         LIMIT 1`,
        [email]
      );
      const user = rows[0];
      if (user && !user.is_verified) {
        await resendVerificationEmail({
          userId: user.id,
          email: user.email,
          fullName: user.full_name,
                ipAddress: clientIp,
          userAgent: req.get('user-agent') || null,
        });
      }
    } catch (error) {
      await logActivity({
        role: 'system',
        action: 'verification.resend_failed',
        entityType: 'auth',
        metadata: { email, reason: error.message },
      });
    }
  }
  await new Promise((resolve) => setTimeout(resolve, Math.max(0, 250 - (Date.now() - startedAt))));
  sendSuccess(res, { message: normalizedMessage });
});

export const studentForgotPassword = asyncHandler(async (req, res) => {
  // eslint-disable-next-line no-console
  console.log('Forgot password endpoint hit');
  const startedAt = Date.now();
  const normalizedMessage = 'If the email exists, a password reset link has been sent.';
  const parsed = studentForgotPasswordSchema.safeParse(req.body);
  if (parsed.success) {
    const email = parsed.data.email.toLowerCase();
    const clientIp = getClientIp(req);
    await assertCaptchaIfRequired({
      action: 'student_forgot_password',
      ipAddress: clientIp,
      captchaToken: req.body?.captchaToken || req.get('x-captcha-token') || '',
    });
    try {
      const [rows] = await mysqlPool.query(
        `SELECT id, email, full_name, status
         FROM users
         WHERE email = ? AND role = 'student'
         LIMIT 1`,
        [email]
      );
      const user = rows[0];
      if (user && user.status === 'active') {
        const emailAllowed = await consumeForgotPasswordEmailRateLimit(email);
        if (emailAllowed) {
          await createAndSendPasswordResetToken({
            userId: user.id,
            email: user.email,
            fullName: user.full_name,
            ipAddress: clientIp,
            userAgent: req.get('user-agent') || null,
          });
        }
      }
    } catch (error) {
      await logActivity({
        role: 'system',
        action: 'password_reset.request_failed',
        entityType: 'auth',
        metadata: { email, reason: error.message },
      });
    }
  }
  await new Promise((resolve) => setTimeout(resolve, Math.max(0, 250 - (Date.now() - startedAt))));
  sendSuccess(res, { message: normalizedMessage });
});

export const studentResetPassword = asyncHandler(async (req, res) => {
  const parsedBody = studentResetPasswordSchema.safeParse(req.body);
  if (!parsedBody.success) {
    const rawToken = String(req.body?.token || '').trim();
    if (!/^[a-f0-9]{64}$/i.test(rawToken)) {
      throw new ApiError(400, 'Invalid or expired reset link');
    }
    throw new ApiError(422, 'Invalid reset payload', parsedBody.error.flatten());
  }
  const clientIp = getClientIp(req);
  const userAgent = req.get('user-agent') || null;
  try {
    await resetStudentPassword({
      rawToken: parsedBody.data.token,
      newPassword: parsedBody.data.password,
      ipAddress: clientIp,
      userAgent,
    });
  } catch (error) {
    if (!(error instanceof ApiError)) {
      await logActivity({
        role: 'system',
        action: 'password_reset.consume_failed',
        entityType: 'auth',
        metadata: { reason: error.message, ipAddress: clientIp },
      });
    }
    throw error;
  }
  clearAllRealmCookies(res);
  clearCsrfCookie(res);
  res.setHeader('Cache-Control', 'no-store, no-cache, max-age=0, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Referrer-Policy', 'no-referrer');
  sendSuccess(res, { message: 'Password updated successfully. Please sign in again.' });
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
  clearRealmCookies(res, 'student');
  setRefreshCookie(res, 'student_refresh_token', result.refreshToken);
  setAccessCookie(res, 'student', result.accessToken);
  setCsrfCookie(res);
  finalizeAuthSuccessResponse(res);
  sendSuccess(res, { student: result.student });
});

export const studentGoogleAuth = asyncHandler(async (req, res) => {
  assertTrustedOrigin(req);
  if (!env.google.clientId) {
    throw new ApiError(503, 'Google Sign-In is not configured');
  }
  const parsed = googleAuthSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(422, 'Invalid Google sign-in payload', parsed.error.flatten());
  }

  const clientIp = getClientIp(req);
  const userAgent = req.get('user-agent') || null;

  let profile;
  try {
    profile = await verifyGoogleIdToken(parsed.data.credential);
  } catch (error) {
    await recordLoginResult({
      identifier: 'google',
      ipAddress: clientIp,
      success: false,
      role: 'student',
      source: 'student.google',
    });
    throw error;
  }

  const normalizedDomain = profile.email.split('@')[1];
  if (env.abuse.blockedEmailDomains.includes(normalizedDomain)) {
    throw new ApiError(422, 'Email domain is not allowed');
  }

  const loginIdentifier = profile.email;
  await assertLoginNotLocked(loginIdentifier, clientIp);

  let result;
  try {
    result = await loginOrRegisterStudentWithGoogle(profile, { clientIp, userAgent });
    await recordLoginResult({
      identifier: loginIdentifier,
      ipAddress: clientIp,
      success: true,
      role: 'student',
      source: 'student.google',
    });
  } catch (error) {
    await recordLoginResult({
      identifier: loginIdentifier,
      ipAddress: clientIp,
      success: false,
      role: 'student',
      source: 'student.google',
    });
    throw error;
  }

  await logActivity({
    userId: result.student.id,
    role: result.student.role,
    action: result.isNewUser ? 'student.register' : 'student.login',
    entityType: 'auth',
    metadata: {
      email: result.student.email,
      username: result.student.username,
      ipAddress: clientIp,
      userAgent,
      source: 'google_oauth',
      isNewUser: result.isNewUser,
      oauthLinked: Boolean(result.linkedExistingAccount),
      provider: 'google',
    },
  });

  clearRealmCookies(res, 'student');
  setRefreshCookie(res, 'student_refresh_token', result.refreshToken);
  setAccessCookie(res, 'student', result.accessToken);
  setCsrfCookie(res);
  finalizeAuthSuccessResponse(res);
  sendSuccess(res, { student: result.student, isNewUser: result.isNewUser });
});

export const teacherLogin = asyncHandler(async (req, res) => {
  assertTrustedOrigin(req);
  const parsed = studentLoginSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(422, 'Invalid login payload', parsed.error.flatten());
  const identifier = parsed.data.identifier.trim();
  if (!identifier) throw new ApiError(422, 'Invalid login payload');
  const loginIdentifier = identifier.toLowerCase();
  const clientIp = getClientIp(req);
  const userAgent = req.get('user-agent') || null;
  await assertLoginNotLocked(loginIdentifier, clientIp);
  let result;
  try {
    result = await loginTeacher({
      identifier,
      password: parsed.data.password,
      authContext: { clientIp, userAgent },
    });
    await recordLoginResult({ identifier: loginIdentifier, ipAddress: clientIp, success: true, role: 'teacher', source: 'teacher.login' });
  } catch (error) {
    await recordLoginResult({ identifier: loginIdentifier, ipAddress: clientIp, success: false, role: 'teacher', source: 'teacher.login' });
    if (error instanceof ApiError && error.statusCode === 401) {
      throw new ApiError(401, 'Invalid credentials');
    }
    throw error;
  }
  await logActivity({
    userId: result.teacher.id,
    role: result.teacher.role,
    action: 'teacher.login',
    entityType: 'auth',
    metadata: {
      email: result.teacher.email,
      username: result.teacher.username,
      ipAddress: clientIp,
      userAgent,
    },
  });
  const { logTeacherLogin } = await import('../services/teacherActivityLog.service.js');
  void logTeacherLogin(result.teacher.id, { ipAddress: clientIp, userAgent });
  clearRealmCookies(res, 'teacher');
  setRefreshCookie(res, 'teacher_refresh_token', result.refreshToken);
  setAccessCookie(res, 'teacher', result.accessToken);
  setCsrfCookie(res);
  finalizeAuthSuccessResponse(res);
  sendSuccess(res, { teacher: result.teacher });
});

export const teacherLogout = asyncHandler(async (req, res) => {
  assertTrustedOrigin(req);
  const refreshToken = req.cookies?.teacher_refresh_token;
  await logoutTeacher(refreshToken);
  clearRefreshCookie(res, 'teacher_refresh_token');
  clearAccessCookie(res, 'teacher');
  await logAuthSessionEnd(req, 'teacher', 'teacher.logout');
  if (req.user?.id) {
    const { logTeacherLogout } = await import('../services/teacherActivityLog.service.js');
    void logTeacherLogout(req.user.id, { ipAddress: getClientIp(req) });
  }
  finalizeAuthSuccessResponse(res);
  sendSuccess(res, { message: 'Logged out' });
});

export const logoutAll = asyncHandler(async (req, res) => {
  assertTrustedOrigin(req);
  const refreshContext = await readRefreshContext(req);
  const payload = verifyRefreshToken(refreshContext.token);
  await revokeAllAuthSessionsForUser(Number(payload.sub));
  clearAllRealmCookies(res);
  clearCsrfCookie(res);
  await logAuthSessionEnd(req, refreshContext.role, 'auth.logout_all');
  finalizeAuthSuccessResponse(res);
  sendSuccess(res, { message: 'Logged out from all sessions' });
});

export const studentMe = asyncHandler(async (req, res) => {
  const trace = startAuthTrace('studentMe', req);
  const profile = await getStudentMePayload(req.user.id, req);
  trace.step('getStudentMePayload');
  if (!profile) {
    trace.end('not-found');
    throw new ApiError(404, 'Student not found');
  }
  trace.end('ok');
  sendSuccess(res, profile);
});

export const teacherMe = asyncHandler(async (req, res) => {
  const profile = await getTeacherMePayload(req.user.id);
  if (!profile) {
    throw new ApiError(404, 'Teacher not found');
  }
  sendSuccess(res, profile);
});

const verifyEmailBodySchema = z.object({
  token: z.string().trim().min(64).max(64),
});

const resendVerificationSchema = z.object({
  email: z.string().trim().email(),
});

const studentForgotPasswordSchema = z.object({
  email: z.string().trim().email(),
});

const studentResetPasswordSchema = z
  .object({
    token: z.string().trim().regex(/^[a-f0-9]{64}$/i),
    password: strongPasswordSchema,
    confirmPassword: z.string().optional(),
  })
  .refine((data) => !data.confirmPassword || data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export const refreshAuth = asyncHandler(async (req, res) => {
  const trace = startAuthTrace('refreshAuth', req);
  assertTrustedOrigin(req);
  trace.step('assertTrustedOrigin');
  const refreshContext = await readRefreshContext(req);
  trace.step('readRefreshContext', { role: refreshContext.role });
  const clientIp = getClientIp(req);
  const userAgent = req.get('user-agent') || null;
  let rotated;
  try {
    rotated = await rotateAuthSessionByRefreshToken(refreshContext.token, { clientIp, userAgent, req });
    trace.step('rotateAuthSessionByRefreshToken');
  } catch (error) {
    await logActivity({
      role: refreshContext.role,
      action: 'auth.refresh_failed',
      entityType: 'auth',
      metadata: { reason: error.message },
    });
    throw error;
  }
  if (isAdminRole(refreshContext.role) && !isAdminRole(rotated.role)) {
    throw new ApiError(403, 'Admin refresh token required');
  }
  if (refreshContext.role === 'student' && rotated.role !== 'student') {
    throw new ApiError(403, 'Student refresh token required');
  }
  if (refreshContext.role === 'teacher' && rotated.role !== 'teacher') {
    throw new ApiError(403, 'Teacher refresh token required');
  }
  if (!rotated.skipRefreshCookie && rotated.refreshToken) {
    setRefreshCookie(res, refreshContext.cookieName, rotated.refreshToken);
  }
  setAccessCookie(res, refreshContext.role, rotated.accessToken);
  setCsrfCookie(res);
  await logActivity({
    userId: rotated.user.id,
    role: rotated.role,
    action: 'auth.refresh',
    entityType: 'auth',
    metadata: { role: rotated.role, ipAddress: clientIp, userAgent },
  });
  finalizeAuthSuccessResponse(res);
  sendSuccess(res, {
    user: rotated.user,
    role: rotated.role,
  });
  trace.end('ok', { role: rotated.role, userId: rotated.user.id });
});
