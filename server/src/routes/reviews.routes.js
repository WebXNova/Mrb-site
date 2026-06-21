import { Router } from 'express';
import {
  getPublicReviewPlatformStats,
  getPublicReviews,
} from '../controllers/publicReviews.controller.js';
import { reviewPublicReadRateLimit } from '../middleware/reviewPublicReadRateLimit.js';

const router = Router();

router.use(reviewPublicReadRateLimit);

router.get('/platform-stats', getPublicReviewPlatformStats);
router.get('/', getPublicReviews);

export default router;
