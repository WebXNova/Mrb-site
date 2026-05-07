import { Router } from 'express';
import {
  adminLogin,
  adminLogout,
  refreshAuth,
  studentLogin,
  studentLogout,
  studentMe,
  studentRegister,
} from '../controllers/auth.controller.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { requireAdmin, requireStudent } from '../middleware/auth.js';
import { authRateLimit } from '../middleware/rateLimit.js';
import { requireCsrf } from '../middleware/csrf.js';

const router = Router();

router.post('/login', authRateLimit, adminLogin);
router.post('/logout', requireCsrf, adminLogout);
router.post('/refresh', requireCsrf, refreshAuth);
router.post('/student/register', authRateLimit, studentRegister);
router.post('/student/login', authRateLimit, studentLogin);
router.post('/student/logout', requireCsrf, studentLogout);
router.get(
  '/me',
  requireAdmin,
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: req.user });
  })
);
router.get('/student/me', requireStudent, studentMe);

export default router;
