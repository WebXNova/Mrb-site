import { Router } from 'express';
import { adminLogin, adminLogout, refreshAuth, studentLogin, studentLogout, studentRegister } from '../controllers/auth.controller.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { requireAdmin, requireStudent } from '../middleware/auth.js';
import { authRateLimit } from '../middleware/rateLimit.js';

const router = Router();

router.post('/login', authRateLimit, adminLogin);
router.post('/logout', adminLogout);
router.post('/refresh', refreshAuth);
router.post('/student/register', authRateLimit, studentRegister);
router.post('/student/login', authRateLimit, studentLogin);
router.post('/student/logout', studentLogout);
router.get(
  '/me',
  requireAdmin,
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: req.user });
  })
);
router.get(
  '/student/me',
  requireStudent,
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: req.user });
  })
);

export default router;
