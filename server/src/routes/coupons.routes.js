import { Router } from 'express';
import {
  getCoupons,
  postCoupon,
  putCoupon,
  putCouponActivate,
  putCouponDeactivate,
} from '../controllers/coupons.controller.js';

const router = Router();

router.get('/', getCoupons);
router.post('/', postCoupon);
router.put('/:id', putCoupon);
router.put('/:id/activate', putCouponActivate);
router.put('/:id/deactivate', putCouponDeactivate);

export default router;
