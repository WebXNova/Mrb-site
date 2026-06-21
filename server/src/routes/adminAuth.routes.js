import { Router } from 'express';
import { adminLogin, adminLogout, issueCsrfSession } from '../controllers/auth.controller.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { enforcePolicy } from '../auth/securityPolicy.js';
import { authRateLimit } from '../middleware/rateLimit.js';
import { rejectAuthHeaderInProduction } from '../middleware/auth.js';
import { ApiError } from '../utils/apiError.js';
import { sendSuccess } from '../utils/httpEnvelope.js';
import { getAdminMePayload } from '../services/adminAuth.service.js';

const router = Router();
router.use(rejectAuthHeaderInProduction);

router.get('/csrf-session', authRateLimit, issueCsrfSession);
router.post('/login', authRateLimit, adminLogin);
router.post('/logout', authRateLimit, enforcePolicy({ csrf: true, auth: 'admin' }), adminLogout);
router.get(
  '/me',
  enforcePolicy({ auth: 'admin', maxRisk: 'elevated' }),
  asyncHandler(async (req, res) => {
    const profile = await getAdminMePayload(req.user?.id);
    if (!profile) {
      throw new ApiError(404, 'Admin not found');
    }
    sendSuccess(res, profile);
  })
);

export default router;
