import { Router } from 'express';
import {
  getPublicPostedRemarks,
  postContactRemark,
} from '../controllers/contactRemarks.controller.js';
import {
  contactRemarkSubmitIpHourlyLimit,
  contactRemarkSubmitIpMinuteLimit,
} from '../middleware/contactRemarkSubmitRateLimit.js';

const router = Router();

router.get('/remarks/posted', getPublicPostedRemarks);
router.post(
  '/remarks',
  contactRemarkSubmitIpMinuteLimit,
  contactRemarkSubmitIpHourlyLimit,
  postContactRemark
);

export default router;
