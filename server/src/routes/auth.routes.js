import { Router } from 'express';
import {
  logoutAll,
  refreshAuth,
  studentLogin,
  studentGoogleAuth,
  studentLogout,
  studentMe,
  studentRegister,
  teacherLogin,
  teacherLogout,
  teacherMe,
  resendVerification,
  studentForgotPassword,
  studentResetPassword,
  verifyEmail,
  issueCsrfSession,
} from '../controllers/auth.controller.js';
import { rejectAuthHeaderInProduction } from '../middleware/auth.js';
import { authRateLimit, forgotPasswordRateLimit, resendVerificationRateLimit, resetPasswordRateLimit, signupAbuseRateLimit, verifyEmailRateLimit } from '../middleware/rateLimit.js';
import { enforcePolicy } from '../auth/securityPolicy.js';

const router = Router();
router.use(rejectAuthHeaderInProduction);

router.get('/csrf-session', authRateLimit, issueCsrfSession);

router.post('/logout-all', authRateLimit, enforcePolicy({ csrf: true }), logoutAll);
router.post('/refresh', authRateLimit, enforcePolicy({ csrf: true }), refreshAuth);
router.post('/student/register', authRateLimit, signupAbuseRateLimit, studentRegister);
router.post('/verify-email', verifyEmailRateLimit, verifyEmail);
router.post('/resend-verification', resendVerificationRateLimit, resendVerification);
router.post('/student/forgot-password', forgotPasswordRateLimit, studentForgotPassword);
router.post('/student/reset-password', resetPasswordRateLimit, studentResetPassword);
router.post('/student/login', authRateLimit, studentLogin);
router.post('/student/google', authRateLimit, studentGoogleAuth);
router.post('/student/logout', authRateLimit, enforcePolicy({ csrf: true, auth: 'student' }), studentLogout);
router.post('/teacher/login', authRateLimit, teacherLogin);
router.post('/teacher/logout', authRateLimit, enforcePolicy({ csrf: true, auth: 'teacher' }), teacherLogout);
router.get('/student/me', enforcePolicy({ auth: 'student', maxRisk: 'elevated' }), studentMe);
router.get('/teacher/me', enforcePolicy({ auth: 'teacher', maxRisk: 'elevated' }), teacherMe);

export default router;
