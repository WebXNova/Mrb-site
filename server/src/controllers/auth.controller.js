import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import { loginAdmin, logoutAdmin } from '../services/adminAuth.service.js';
import { loginStudent, registerStudent } from '../services/studentAuth.service.js';
import { logActivity } from '../services/activityLog.service.js';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});
const registerSchema = z.object({
  fullName: z.string().min(2).max(120),
  email: z.string().email(),
  password: z.string().min(8),
});

export const adminLogin = asyncHandler(async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(422, 'Invalid login payload', parsed.error.flatten());
  }

  const result = await loginAdmin(parsed.data.email, parsed.data.password);

  res.cookie('admin_access_token', result.accessToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    maxAge: 15 * 60 * 1000,
  });
  res.cookie('admin_refresh_token', result.refreshToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

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
  if (!parsed.success) throw new ApiError(422, 'Invalid register payload', parsed.error.flatten());
  const result = await registerStudent(parsed.data);
  res.status(201).json({ success: true, data: result });
});

export const studentLogin = asyncHandler(async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(422, 'Invalid login payload', parsed.error.flatten());
  const result = await loginStudent(parsed.data);
  res.json({ success: true, data: result });
});
