import { Router } from 'express';
import { adminLogin, adminLogout } from '../controllers/auth.controller.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { requireAdmin } from '../middleware/auth.js';

const router = Router();

router.post('/login', adminLogin);
router.post('/logout', adminLogout);
router.get(
  '/me',
  requireAdmin,
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: req.user });
  })
);

export default router;
