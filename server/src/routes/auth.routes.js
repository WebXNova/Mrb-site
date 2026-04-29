import { Router } from 'express';
import { adminLogin, adminLogout, studentLogin, studentRegister } from '../controllers/auth.controller.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { requireAdmin, requireStudent } from '../middleware/auth.js';

const router = Router();

router.post('/login', adminLogin);
router.post('/logout', adminLogout);
router.post('/student/register', studentRegister);
router.post('/student/login', studentLogin);
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
