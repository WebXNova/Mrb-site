import { Router } from 'express';
import {
  adminLogin,
  adminLogout,
  logoutAll,
  refreshAuth,
  studentLogin,
  studentLogout,
  studentMe,
  studentRegister,
  resendVerification,
  verifyEmail,
  issueCsrfSession,
} from '../controllers/auth.controller.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { rejectAuthHeaderInProduction } from '../middleware/auth.js';
import { authRateLimit, resendVerificationRateLimit, signupAbuseRateLimit, verifyEmailRateLimit } from '../middleware/rateLimit.js';
import { enforcePolicy } from '../auth/securityPolicy.js';
import { sendSuccess } from '../utils/httpEnvelope.js';

const router = Router();
router.use(rejectAuthHeaderInProduction);

router.get('/csrf-session', authRateLimit, issueCsrfSession);

router.post('/login', authRateLimit, adminLogin);
router.post('/logout', authRateLimit, enforcePolicy({ csrf: true, auth: 'admin' }), adminLogout);
router.post('/logout-all', authRateLimit, enforcePolicy({ csrf: true }), logoutAll);
router.post('/refresh', authRateLimit, enforcePolicy({ csrf: true }), refreshAuth);
router.post('/student/register', authRateLimit, signupAbuseRateLimit, studentRegister);
router.post('/verify-email', verifyEmailRateLimit, verifyEmail);
router.post('/resend-verification', resendVerificationRateLimit, resendVerification);
router.post('/student/login', authRateLimit, studentLogin);
router.post('/student/logout', authRateLimit, enforcePolicy({ csrf: true, auth: 'student' }), studentLogout);
router.get(
  '/me',
  enforcePolicy({ auth: 'admin', maxRisk: 'elevated' }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, req.user);
  })
);
router.get('/student/me', enforcePolicy({ auth: 'student', maxRisk: 'elevated' }), studentMe);

export default router;
